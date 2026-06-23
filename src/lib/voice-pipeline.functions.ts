import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput } from "@/lib/voice/process-voice-input";
import { dispatchVoiceBundle } from "@/lib/voice/dispatch-voice-action";
import { loadUserPersona } from "@/lib/voice/load-persona";
import type { PipelineResult, VoiceAction, VoiceIntent } from "@/lib/voice/types";

const CONFIRMABLE_SUGGESTED: ReadonlySet<VoiceIntent> = new Set(["reminder", "event", "note"]);

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
    const { actions: classified, meta } = await processVoiceInput(text, persona);
    const primary = classified[0];

    // 1b. assistant_chat: pak korte reply + (optionele) vervolgacties uit.
    //     Vervolgacties worden NOOIT direct uitgevoerd — ze gaan via de
    //     bestaande needs_confirmation / commitVoiceBundle-flow.
    let assistantReply: string | null = null;
    let actions: VoiceAction[] = classified;
    if (primary?.intent === "assistant_chat") {
      const replyRaw = primary.payload.reply;
      assistantReply = typeof replyRaw === "string" && replyRaw.trim() ? replyRaw.trim() : "Ik denk met je mee.";
      const suggestedRaw = primary.payload.suggested_actions;
      const suggested: VoiceAction[] = Array.isArray(suggestedRaw)
        ? suggestedRaw
            .map((s): VoiceAction | null => {
              if (!s || typeof s !== "object") return null;
              const obj = s as { intent?: unknown; payload?: unknown };
              const intent = typeof obj.intent === "string" ? (obj.intent as VoiceIntent) : null;
              if (!intent || !CONFIRMABLE_SUGGESTED.has(intent)) return null;
              const payload = obj.payload && typeof obj.payload === "object"
                ? (obj.payload as Record<string, unknown>)
                : {};
              return { intent, payload, confidence: 0.7 };
            })
            .filter((x): x is VoiceAction => !!x)
        : [];
      if (suggested.length > 0) {
        actions = suggested;
      } else {
        actions = [primary];
      }
    }

    // 2. Log intent-classificatie (één rij per zin, met alle (originele) actions in payload)
    supabase
      .from("voice_intents")
      .insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        model: meta.model,
        intent: primary.intent,
        confidence: primary.confidence,
        payload: { actions: classified, persona_signature: persona.signature } as never,
        prompt_tokens: meta.prompt_tokens,
        completion_tokens: meta.completion_tokens,
        total_tokens: meta.total_tokens,
        ambiguous: classified.some((a) => !!a.ambiguous),
        clarification_question:
          classified.find((a) => a.clarification_question)?.clarification_question ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[pipeline] voice_intents log", error);
      });

    // 3. Dispatch bundle (persona doorgegeven voor query-handler caps + toon)
    const result = await dispatchVoiceBundle({ supabase, userId, persona }, actions);

    // 3b. assistant_chat reply altijd meesturen voor TTS/UI.
    if (assistantReply) {
      result.assistant_reply = assistantReply;
      // Voor needs_confirmation: laat de reply leidend zijn in de gesproken intro.
      if (result.status === "needs_confirmation") {
        result.confirmation = assistantReply;
      } else if (result.status === "completed" && !result.query_result) {
        result.confirmation = assistantReply;
      }
    }

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
