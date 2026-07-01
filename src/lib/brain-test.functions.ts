/**
 * Brain Test Mode — dev/admin-only server function.
 *
 * Draait één turn door de volledige Brain (Reasoning + Response + Quality)
 * en retourneert de interne trace zodat we in de UI kunnen zien waaróm
 * HoofdRust een bepaald antwoord geeft. Niet bedoeld voor eindgebruikers.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput, type BrainDebug } from "@/lib/voice/process-voice-input";
import { loadUserPersona } from "@/lib/voice/load-persona";
import { buildContextSummary } from "@/lib/assistant/context-summary";

export type BrainTestResult = {
  debug: BrainDebug | null;
  meta: {
    model: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
  };
  error?: string;
};

export const runBrainTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = data as { text?: string; includeContext?: boolean };
    if (!d || typeof d.text !== "string" || !d.text.trim()) {
      throw new Error("text is required");
    }
    return {
      text: d.text.trim().slice(0, 500),
      includeContext: !!d.includeContext,
    };
  })
  .handler(async ({ data, context }) => {
    try {
      const [persona, contextSummary] = await Promise.all([
        loadUserPersona(context.userId).catch(() => undefined),
        data.includeContext
          ? buildContextSummary(context.userId).catch(() => null)
          : Promise.resolve(null),
      ]);

      const result = await processVoiceInput(data.text, persona, {
        contextSummary,
        history: [],
        debug: true,
      });

      return {
        debug: result.debug ?? null,
        meta: result.meta,
      } satisfies BrainTestResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        debug: null,
        meta: { model: "error", prompt_tokens: null, completion_tokens: null, total_tokens: null },
        error: message,
      } satisfies BrainTestResult;
    }
  });
