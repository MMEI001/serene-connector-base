/**
 * Continuation helpers — Sprint 5.
 *
 * Wanneer een gebruiker een tweede zin uitspreekt na een lopende Experience
 * (bv. "Het is een meisje van acht"), willen we die zin niet als een nieuwe
 * intent classificeren maar als aanvulling op de bestaande experience_data.
 *
 * Pure helpers, geen I/O — makkelijk te testen.
 */

import type { GiftEventInput } from "./gift-event";

const AGE_RE = /\b(\d{1,2})\s*(?:jaar|j\.?|jr|jarige?)\b/i;
const SHORT_NUMBER_RE = /\b(\d{1,2})\b/;
const GENDER_INTEREST_RE =
  /\b(meisje|jongen|dochter|zoon|baby|peuter|kleuter|tiener|jongere|kind|knutselen|tekenen|bouwen|lego|knuffel|boek|paard|voetbal|dans|muziek|piano|dino|dinosaur|prinses|robot|ridder|trein|auto)\b/i;
const BUDGET_RE =
  /\b(\d{1,3})\s*(?:euro|eur|€)\b|\b(?:budget|max(?:imaal)?|rond(?:om)?\s+de?)\s+(\d{1,3})\b/i;

export type AskField = "age" | "interests" | "budget" | "who";

/**
 * Lichte heuristiek: lijkt deze zin op aanvullende info bij een lopende
 * gift_event? We zijn ruim aan de "ja"-kant zodra er een leeftijd, getal,
 * gender-/interesse-trefwoord of budget in voorkomt EN de zin kort is.
 */
export function looksLikeContinuation(
  text: string,
  askedField: AskField | null,
): boolean {
  const t = text.trim();
  if (!t) return false;
  const wc = t.split(/\s+/).length;
  // Lange zinnen ( > 14 woorden) zijn vrijwel altijd een nieuwe intent.
  if (wc > 14) return false;

  if (AGE_RE.test(t)) return true;
  if (BUDGET_RE.test(t)) return true;
  if (GENDER_INTEREST_RE.test(t)) return true;

  // Als we expliciet om leeftijd vroegen, accepteer een kale "acht" / "8".
  if (askedField === "age" && SHORT_NUMBER_RE.test(t) && wc <= 6) return true;
  if (askedField === "interests" && wc <= 8) return true;
  if (askedField === "budget" && SHORT_NUMBER_RE.test(t) && wc <= 6) return true;

  return false;
}

/** Trek leeftijd/interesses/budget/who uit een (vaak korte) zin. */
export function extractFieldsFromUtterance(
  text: string,
  askedField: AskField | null,
): Partial<GiftEventInput> {
  const out: Partial<GiftEventInput> = {};
  const t = text.trim();
  if (!t) return out;

  // Age — voorkeur "8 jaar", anders kaal getal als we erom vroegen.
  const ageMatch = t.match(AGE_RE);
  if (ageMatch) {
    const n = parseInt(ageMatch[1], 10);
    if (n >= 0 && n <= 99) out.age = n;
  } else if (askedField === "age") {
    const num = t.match(SHORT_NUMBER_RE);
    if (num) {
      const n = parseInt(num[1], 10);
      if (n >= 0 && n <= 99) out.age = n;
    } else {
      const word = numberWordToInt(t);
      if (word != null) out.age = word;
    }
  }

  // Budget
  const budget = t.match(BUDGET_RE);
  if (budget) {
    const n = parseInt(budget[1] ?? budget[2] ?? "", 10);
    if (!Number.isNaN(n) && n > 0 && n < 1000) {
      out.budget = n;
      out.budget_currency = "EUR";
    }
  }

  // Who: "meisje"/"jongen"/"dochter" verfijnen
  const whoMatch = t.match(/\b(meisje|jongen|dochter|zoon|baby|peuter|kleuter|tiener)\b/i);
  if (whoMatch) {
    out.who = whoMatch[1].toLowerCase();
  }

  // Interesses — lichte vrije-tekst extractie (max 3 woorden)
  const interests = collectInterests(t);
  if (interests.length) out.interests = interests;

  return out;
}

const NL_NUMBER_WORDS: Record<string, number> = {
  nul: 0, een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6,
  zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12, dertien: 13,
  veertien: 14, vijftien: 15, zestien: 16,
};

function numberWordToInt(t: string): number | null {
  const lc = t.toLowerCase().replace(/[^a-zéë]/g, " ");
  for (const word of lc.split(/\s+/)) {
    if (word in NL_NUMBER_WORDS) return NL_NUMBER_WORDS[word];
  }
  return null;
}

const INTEREST_WORDS = [
  "knutselen", "tekenen", "bouwen", "lego", "knuffel", "boek", "boeken",
  "paard", "paarden", "voetbal", "dans", "dansen", "muziek", "piano",
  "dino", "dinosaur", "dinosaurus", "prinses", "robot", "ridder", "trein",
  "auto", "auto's", "puzzel", "puzzelen", "lezen", "tekenfilms",
];

function collectInterests(t: string): string[] {
  const lc = t.toLowerCase();
  const hits: string[] = [];
  for (const w of INTEREST_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(lc) && !hits.includes(w)) hits.push(w);
    if (hits.length >= 3) break;
  }
  return hits;
}

/** Merge nieuwe waarden over bestaande state. Nieuwe waarden winnen. */
export function mergeGiftData(
  prev: GiftEventInput,
  next: Partial<GiftEventInput>,
): GiftEventInput {
  return {
    who: next.who ?? prev.who,
    event_type: next.event_type ?? prev.event_type,
    iso_datetime: next.iso_datetime ?? prev.iso_datetime,
    age: next.age ?? prev.age,
    interests: mergeInterests(prev.interests, next.interests),
    budget: next.budget ?? prev.budget,
    budget_currency: next.budget_currency ?? prev.budget_currency,
  };
}

function mergeInterests(a?: string[], b?: string[]): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [a ?? [], b ?? []]) {
    for (const x of list) {
      const k = x.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
      if (out.length >= 5) return out;
    }
  }
  return out;
}
