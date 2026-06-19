import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput } from "@/lib/voice/process-voice-input";
import { dispatchVoiceAction } from "@/lib/voice/dispatch-voice-action";
import type { PipelineResult } from "@/lib/voice/types";

const MIN_WORDS = 2;

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

    // Lege of te-korte transcriptie → skip, geen voice_actions / domain-write.
    if (!text || wordCount(text) < MIN_WORDS) {
      return { intent: "release", status: "skipped", confirmation: "" };
    }

    // 1. Classify (fase A: hardcoded release; fase B: GPT)
    const action = await processVoiceInput(text);

    // 2. Dispatch naar handler
    const result = await dispatchVoiceAction({ supabase, userId }, action);

    // 3. Audit-log in voice_actions (alleen wanneer er iets gebeurd is)
    if (result.status !== "skipped") {
      const { error: logErr } = await supabase.from("voice_actions").insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        intent: action.intent,
        payload: action.payload,
        result_table: result.ref?.table ?? null,
        result_id: result.ref?.id ?? null,
        status: result.status,
        error: result.error ?? null,
      });
      if (logErr) console.error("[voice-pipeline] audit log failed", logErr);
    }

    return result;
  });
