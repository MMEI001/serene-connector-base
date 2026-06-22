import type { VoiceAction, VoiceIntent } from "./types";

/**
 * Mock intent-classifier voor fase B-voorbereiding.
 *
 * Herkent een paar duidelijke patronen via keyword-matching. Niet perfect,
 * maar voldoende om de pipeline Whisper → intent → handler → bevestiging
 * end-to-end te kunnen testen zonder GPT-call.
 *
 * Signature en return-type matchen de echte fase B-implementatie (GPT-4o-mini
 * met function-calling), zodat omschakelen later één-regel-vervangen wordt.
 */

type Pattern = { intent: VoiceIntent; keywords: RegExp; confidence: number };

// Volgorde = prioriteit. Eerste match wint.
const PATTERNS: Pattern[] = [
  {
    intent: "reminder",
    keywords:
      /\b(herinner(?:\s+me)?|zet\s+op|herinnering|onthoud(?:\s+dat)?|niet\s+vergeten|morgen|vanavond|straks|om\s+\d{1,2}(?:[:.]\d{2})?\s*(?:uur)?)\b/i,
    confidence: 0.7,
  },
  {
    intent: "query",
    keywords:
      /\b(wat\s+staat\s+er|wanneer\s+is|heb\s+ik|wat\s+heb\s+ik|wat\s+moet\s+ik|laat\s+(?:me\s+)?zien|toon|welke\s+afspraken|hoe\s+laat)\b/i,
    confidence: 0.7,
  },
  {
    intent: "release",
    keywords:
      /\b(loslaten|laat\s+los|baal|frustreer|frustreert|frustrerend|kwijt|uit\s+mijn\s+hoofd|ergernis|gefrustreerd|boos|moe|stress)\b/i,
    confidence: 0.75,
  },
];

export async function processVoiceInput(text: string): Promise<VoiceAction> {
  const trimmed = text.trim();

  for (const p of PATTERNS) {
    if (p.keywords.test(trimmed)) {
      return {
        intent: p.intent,
        payload: { text: trimmed },
        confidence: p.confidence,
      };
    }
  }

  // Default: behandel als release (huidige fase A-gedrag).
  return {
    intent: "release",
    payload: { text: trimmed },
    confidence: 0.4,
  };
}
