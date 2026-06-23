import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput } from "@/lib/voice/process-voice-input";
import { dispatchVoiceBundle } from "@/lib/voice/dispatch-voice-action";
import { loadUserPersona } from "@/lib/voice/load-persona";
import type { PipelineResult } from "@/lib/voice/types";

const MIN_WORDS = 2;
const PENDING_TTL_MS = 5 * 60 * 1000;

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

    // 0. Persona laden uit user_profiles (RLS-actief via supabase-client van auth-middleware)
    const persona = await loadUserPersona(supabase, userId);

    // 1. GPT-classify → 1..3 actions (persona stuurt toon + intent-bias)
    const { actions, meta } = await processVoiceInput(text, persona);

    // 2. Log intent-classificatie (één rij per zin, met alle actions in payload)
    const primary = actions[0];
    supabase
      .from("voice_intents")
      .insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        model: meta.model,
        intent: primary.intent,
        confidence: primary.confidence,
        payload: { actions, persona_signature: persona.signature } as never,
        prompt_tokens: meta.prompt_tokens,
        completion_tokens: meta.completion_tokens,
        total_tokens: meta.total_tokens,
        ambiguous: actions.some((a) => !!a.ambiguous),
        clarification_question:
          actions.find((a) => a.clarification_question)?.clarification_question ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[pipeline] voice_intents log", error);
      });

    // 3. Dispatch bundle (persona doorgegeven voor query-handler caps + toon)
    const result = await dispatchVoiceBundle({ supabase, userId, persona }, actions);

    if (result.status === "skipped") return result;

    // 4a. needs_confirmation → bewaar hele bundle in voice_actions.payload.actions
    if (result.status === "needs_confirmation") {
      const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
      const { data: row, error } = await supabase
        .from("voice_actions")
        .insert({
          user_id: userId,
          transcription_id: data.transcription_id,
          intent: primary.intent,
          payload: { actions } as never,
          status: "needs_confirmation",
          confirmation_text: result.preview ?? result.confirmation,
          expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (error || !row) {
        return {
          intent: primary.intent,
          status: "failed",
          confirmation: "Kon de bevestiging niet voorbereiden.",
          error: error?.message ?? "pending insert failed",
        };
      }
      return { ...result, action_id: row.id as string, expires_at: expiresAt };
    }

    // 4b. completed/failed → audit-log
    if (result.status === "completed" || result.status === "failed") {
      const { error: logErr } = await supabase.from("voice_actions").insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        intent: primary.intent,
        payload: { actions } as never,
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
