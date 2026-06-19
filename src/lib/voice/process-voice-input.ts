import type { VoiceAction } from "./types";

/**
 * Fase A: alle input wordt als "release" geclassificeerd.
 *
 * Fase B vervangt de body door een GPT-4o-mini call met function-calling die
 * intent + payload teruggeeft. Signature en return-type blijven identiek,
 * zodat de dispatcher en alle handlers ongewijzigd blijven.
 */
export async function processVoiceInput(text: string): Promise<VoiceAction> {
  return {
    intent: "release",
    payload: { text },
    confidence: 1,
  };
}
