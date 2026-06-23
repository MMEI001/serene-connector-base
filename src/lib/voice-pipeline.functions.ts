import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput } from "@/lib/voice/process-voice-input";
import { dispatchVoiceAction } from "@/lib/voice/dispatch-voice-action";
import type { PipelineResult } from "@/lib/voice/types";

const MIN_WORDS = 2;
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minuten: timeout + revive-venster

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export const runVoicePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { text: string; transcription_id?: string | null }) => ({
      text: typeof data?.text === "string" ? data.text : "",
      transcription_id:
        typeof data?.transcription_id === "string" ? data.transcription_id : null,
    }),
  )
  .handler(async ({ data, context }): Promise<PipelineResult> => {
    const { supabase, userId } = context;
    const text = data.text.trim();

    if (!text || wordCount(text) < MIN_WORDS) {
      return { intent: "release", status: "skipped", confirmation: "" };
    }

    // 1. GPT-classify
    const { action, meta } = await processVoiceInput(text);

    // 2. Log intent-classificatie (best-effort)
    supabase
      .from("voice_intents")
      .insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        model: meta.model,
        intent: action.intent,
        confidence: action.confidence,
        payload: action.payload as never,
        prompt_tokens: meta.prompt_tokens,
        completion_tokens: meta.completion_tokens,
        total_tokens: meta.total_tokens,
        ambiguous: !!action.ambiguous,
        clarification_question: action.clarification_question ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[pipeline] voice_intents log", error);
      });

    // 3. Dispatch — release/query/note/checkin schrijven direct; reminder/event geven preview
    const result = await dispatchVoiceAction({ supabase, userId }, action);

    if (result.status === "skipped") return result;

    // 4a. needs_confirmation → pending row in voice_actions met expires_at
    if (result.status === "needs_confirmation") {
      const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
      const { data: row, error } = await supabase
        .from("voice_actions")
        .insert({
          user_id: userId,
          transcription_id: data.transcription_id,
          intent: action.intent,
          payload: action.payload as never,
          status: "needs_confirmation",
          confirmation_text: result.preview ?? result.confirmation,
          expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (error || !row) {
        return {
          intent: action.intent,
          status: "failed",
          confirmation: "Kon de bevestiging niet voorbereiden.",
          error: error?.message ?? "pending insert failed",
        };
      }
      return { ...result, action_id: row.id as string, expires_at: expiresAt };
    }

    // 4b. completed/failed → audit-log (geen pending row)
    if (result.status === "completed" || result.status === "failed") {
      const { error: logErr } = await supabase.from("voice_actions").insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        intent: action.intent,
        payload: action.payload as never,
        result_table: result.ref?.table ?? null,
        result_id: result.ref?.id ?? null,
        status: result.status,
        error: result.error ?? null,
        confirmation_text: result.confirmation,
      });
      if (logErr) console.error("[pipeline] audit log", logErr);
    }

    return result;
  });
