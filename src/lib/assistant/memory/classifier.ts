/**
 * Memory Classifier v1 — keyword-/patroon-gebaseerd. Geen LLM-call.
 *
 * Doel: alleen voorstellen wat duidelijk een blijvende voorkeur is.
 * Bij twijfel niets voorstellen — liever niets opslaan dan iets onjuist.
 *
 * Strategie: per turn maximaal één kandidaat (de hoogst-scorende).
 * De Memory Engine vraagt daarna expliciet om bevestiging.
 */

import type { MemoryCandidate, MemoryCategory } from "./types";
import { scoreFutureValue } from "./future-value";

type Pattern = {
  re: RegExp;
  category: MemoryCategory;
  subjectFromMatch?: (m: RegExpMatchArray) => string | null;
  valueFromMatch: (m: RegExpMatchArray) => string;
  baseConfidence: number;
  buildQuestion: (subject: string | null, value: string) => string;
};

const lowercase = (s: string) => s.trim().toLowerCase();

const PATTERNS: Pattern[] = [
  // "mijn dochter/zoon/kind houdt van X" → child_interest
  {
    re: /\bmijn (dochter|zoon|kind)\b[^.?!]*\bhoudt van ([a-zà-ÿ' \-]{2,40})/i,
    category: "child_interest",
    subjectFromMatch: (m) => lowercase(m[1]),
    valueFromMatch: (m) => lowercase(m[2]),
    baseConfidence: 0.9,
    buildQuestion: (s, v) =>
      `Ik kan onthouden dat je ${s ?? "kind"} van ${v} houdt, zodat ik daar de volgende keer rekening mee houd. Vind je dat goed?`,
  },
  // "mijn dochter/zoon doet aan X" → child_activity
  {
    re: /\bmijn (dochter|zoon|kind)\b[^.?!]*\bdoet aan ([a-zà-ÿ' \-]{2,40})/i,
    category: "child_activity",
    subjectFromMatch: (m) => lowercase(m[1]),
    valueFromMatch: (m) => lowercase(m[2]),
    baseConfidence: 0.85,
    buildQuestion: (s, v) =>
      `Wil je dat ik onthoud dat je ${s ?? "kind"} aan ${v} doet?`,
  },
  // "ik ben (vegetariër|veganist|vegan)" → food_preference
  {
    re: /\bik (ben|eet)\s+(vegetari[eë]r|veganist|vegan|halal|kosher)\b/i,
    category: "food_preference",
    valueFromMatch: (m) => lowercase(m[2]),
    baseConfidence: 0.9,
    buildQuestion: (_s, v) =>
      `Zal ik onthouden dat je ${v} bent, zodat ik daar rekening mee houd?`,
  },
  // "ik eet geen X"
  {
    re: /\bik eet (?:geen|nooit) ([a-zà-ÿ' \-]{2,30})/i,
    category: "food_preference",
    valueFromMatch: (m) => `geen ${lowercase(m[1])}`,
    baseConfidence: 0.8,
    buildQuestion: (_s, v) => `Wil je dat ik onthoud dat je ${v} eet?`,
  },
  // "we hebben een hond/kat/konijn (genaamd X)"
  {
    re: /\b(?:we hebben|ik heb) een (hond|kat|konijn|cavia|paard|vis)(?: (?:die|genaamd) ([a-zà-ÿ' \-]{2,30}))?/i,
    category: "pet",
    valueFromMatch: (m) =>
      m[2] ? `${lowercase(m[1])} (${lowercase(m[2])})` : lowercase(m[1]),
    baseConfidence: 0.85,
    buildQuestion: (_s, v) =>
      `Zal ik onthouden dat jullie een ${v} hebben?`,
  },
  // "mijn man/vrouw/partner heet X"
  {
    re: /\bmijn (man|vrouw|partner|moeder|vader)\b[^.?!]*\bheet ([a-zà-ÿ' \-]{2,30})/i,
    category: "family_member",
    subjectFromMatch: (m) => lowercase(m[1]),
    valueFromMatch: (m) => lowercase(m[2]),
    baseConfidence: 0.9,
    buildQuestion: (s, v) =>
      `Wil je dat ik onthoud dat je ${s ?? "partner"} ${v} heet?`,
  },
  // "mijn favoriete X is Y" → favorite
  {
    re: /\bmijn favoriete ([a-zà-ÿ' \-]{2,25}) (?:is|zijn) ([a-zà-ÿ' \-]{2,30})/i,
    category: "favorite",
    subjectFromMatch: (m) => lowercase(m[1]),
    valueFromMatch: (m) => lowercase(m[2]),
    baseConfidence: 0.8,
    buildQuestion: (s, v) =>
      `Zal ik onthouden dat je favoriete ${s} ${v} is?`,
  },
  // hobby — "mijn hobby is X" / "ik ben gek op X" / "ik (sport|hardloop|tuinier|fiets) (graag)"
  {
    re: /\bmijn hobby (?:is|zijn) ([a-zà-ÿ' \-]{2,30})/i,
    category: "hobby",
    valueFromMatch: (m) => lowercase(m[1]),
    baseConfidence: 0.85,
    buildQuestion: (_s, v) => `Wil je dat ik onthoud dat ${v} je hobby is?`,
  },
  // shop_preference — "ik bestel altijd bij X" / "liever bij X"
  {
    re: /\b(?:ik (?:bestel|koop|winkel) (?:altijd|meestal|graag)|liever) bij ([a-zà-ÿ0-9' \-]{2,30})/i,
    category: "shop_preference",
    valueFromMatch: (m) => lowercase(m[1]),
    baseConfidence: 0.75,
    buildQuestion: (_s, v) =>
      `Zal ik onthouden dat je voorkeur uitgaat naar ${v}?`,
  },
  // reminder_preference — "herinner me 's ochtends" / "liever om HH:MM"
  {
    re: /\b(?:herinner(?:ingen)? (?:me|graag)|reminders? (?:graag|liever))[^.?!]*?('s ochtends|'s avonds|'s middags|om \d{1,2}[:.]\d{2})/i,
    category: "reminder_preference",
    valueFromMatch: (m) => lowercase(m[1]),
    baseConfidence: 0.75,
    buildQuestion: (_s, v) =>
      `Zal ik onthouden dat je herinneringen ${v} prefereert?`,
  },
  // travel_preference — "we reizen graag naar X"
  {
    re: /\bwe (?:reizen|gaan) (?:graag|altijd) naar ([a-zà-ÿ' \-]{2,30})/i,
    category: "travel_preference",
    valueFromMatch: (m) => lowercase(m[1]),
    baseConfidence: 0.7,
    buildQuestion: (_s, v) =>
      `Wil je dat ik onthoud dat jullie graag naar ${v} gaan?`,
  },
];

export function extractMemoryCandidates(text: string): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  if (!text || text.length < 6) return out;

  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    const value = p.valueFromMatch(m).replace(/\s+/g, " ").trim();
    if (!value || value.length < 2) continue;
    const subject = p.subjectFromMatch ? p.subjectFromMatch(m) : null;
    out.push({
      subject,
      category: p.category,
      value,
      confidence: p.baseConfidence,
      futureValue: scoreFutureValue(p.category, value),
      confirmQuestion: p.buildQuestion(subject, value),
    });
  }

  // Eén kandidaat per turn — neem de hoogste future value × confidence.
  out.sort((a, b) => b.futureValue * b.confidence - a.futureValue * a.confidence);
  return out.slice(0, 1);
}

/**
 * Detecteert of de gebruiker net "ja" / "nee" zegt op een lopende
 * bevestigingsvraag van de Memory Engine. Houd het bewust beperkt.
 */
export type ConfirmReply = "yes" | "no" | null;
export function detectMemoryConfirmation(text: string): ConfirmReply {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^(ja|jazeker|prima|graag|oké|okay|ok|goed|doe maar|leuk)\b[!.\s]*$/.test(t)) return "yes";
  if (/^(nee|liever niet|niet doen|nee dank je|laat maar)\b[!.\s]*$/.test(t)) return "no";
  return null;
}
