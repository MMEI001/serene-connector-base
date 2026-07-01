/**
 * Brain Test Mode — dev/admin-only server function.
 *
 * Draait één turn door de volledige Brain (Reasoning + Response + Quality)
 * en retourneert de interne trace zodat we in de UI kunnen zien waaróm
 * HoofdRust een bepaald antwoord geeft. Niet bedoeld voor eindgebruikers.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput } from "@/lib/voice/process-voice-input";
import { loadUserPersona } from "@/lib/voice/load-persona";

export type BrainTestSuggestedAction = {
  intent: string;
  payloadJson: string;
};

export type BrainTestResult = {
  ok: boolean;
  transcript: string;
  reasoning: string | null;
  draftReply: string;
  qualityImproved: string | null;
  finalReply: string;
  intent: string;
  actionRequired: boolean;
  needsConfirmation: boolean;
  suggestedActions: BrainTestSuggestedAction[];
  confidence: number;
  ambiguous: boolean;
  clarificationQuestion: string | null;
  model: string;
  totalTokens: number | null;
  error: string | null;
};

const EMPTY = (text: string, error: string): BrainTestResult => ({
  ok: false,
  transcript: text,
  reasoning: null,
  draftReply: "",
  qualityImproved: null,
  finalReply: "",
  intent: "-",
  actionRequired: false,
  needsConfirmation: false,
  suggestedActions: [],
  confidence: 0,
  ambiguous: false,
  clarificationQuestion: null,
  model: "error",
  totalTokens: null,
  error,
});

export const runBrainTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = data as { text?: string };
    if (!d || typeof d.text !== "string" || !d.text.trim()) {
      throw new Error("text is required");
    }
    return { text: d.text.trim().slice(0, 500) };
  })
  .handler(async ({ data, context }): Promise<BrainTestResult> => {
    try {
      const persona = await loadUserPersona(context.supabase, context.userId).catch(
        () => undefined,
      );

      const result = await processVoiceInput(data.text, persona, {
        contextSummary: null,
        history: [],
        debug: true,
      });
      const d = result.debug;
      if (!d) return EMPTY(data.text, "geen debug-trace ontvangen");

      return {
        ok: true,
        transcript: d.transcript,
        reasoning: d.reasoning,
        draftReply: d.draftReply,
        qualityImproved: d.qualityImproved,
        finalReply: d.finalReply,
        intent: d.intent,
        actionRequired: d.actionRequired,
        needsConfirmation: d.needsConfirmation,
        suggestedActions: d.suggestedActions.map((s) => ({
          intent: s.intent,
          payloadJson: JSON.stringify(s.payload),
        })),
        confidence: d.confidence,
        ambiguous: d.ambiguous,
        clarificationQuestion: d.clarificationQuestion,
        model: result.meta.model,
        totalTokens: result.meta.total_tokens,
        error: null,
      };
    } catch (err) {
      return EMPTY(data.text, err instanceof Error ? err.message : String(err));
    }
  });
