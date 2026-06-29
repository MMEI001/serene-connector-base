/**
 * Spoken summaries voor Experience 001 — Sprint 5.
 *
 * Doel: TTS klinkt minder als een lijstje, meer alsof HoofdRust meedenkt.
 * Houdt het deterministisch: opener wordt gekozen op basis van een
 * stabiele hash (turn_id) zodat dezelfde turn dezelfde tekst geeft, maar
 * verschillende turns variëren.
 */

import type { GiftEventInput } from "./gift-event";
import type { AskField } from "./continuation";

function pick<T>(turnId: string, options: T[]): T {
  if (!options.length) throw new Error("pick: empty options");
  let h = 0;
  for (let i = 0; i < turnId.length; i++) h = (h * 31 + turnId.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}

/* ---------------- Resultaat-samenvatting ---------------- */

const OPENERS_NEW = [
  "Leuk!",
  "Wat gezellig.",
  "Ah, een feestje —",
  "Mooi,",
];

const OPENERS_KNOWN = [
  "Ik denk met je mee.",
  "Even meedenken:",
  "Goed dat je het noemt.",
];

const LIST_CONNECTORS = [
  (a: string, b: string, c: string) => `je zou kunnen denken aan ${a}, ${b} of ${c}`,
  (a: string, b: string, c: string) => `wat dacht je van ${a}, ${b} of ${c}`,
  (a: string, b: string, c: string) => `bijvoorbeeld ${a}, ${b}, of misschien ${c}`,
];

export function buildResultSummary(args: {
  turnId: string;
  who: string;
  age?: number;
  ideas: string[];
  whenIso: string | null;
  reminderIso: string | null;
  existingReminder: boolean;
  isContinuation: boolean;
}): string {
  const { turnId, who, age, ideas, reminderIso, existingReminder, isContinuation } = args;
  const top = ideas.slice(0, 3).map((s) => s.replace(/\.$/, ""));

  // Opener — minder enthousiast bij continuation (we hadden 'm al verwelkomd).
  const openerPool = isContinuation ? OPENERS_KNOWN : OPENERS_NEW;
  const opener = pick(turnId, openerPool);

  // Persoonlijker als we leeftijd + naam kennen.
  const ageBit = age ? ` (${spelledAge(age)} jaar)` : "";
  const persoonlijk =
    who && who !== "het feestje"
      ? `Voor ${who}${ageBit}`
      : `Voor ${age ? `iemand van ${spelledAge(age)}` : "een kind"}`;

  let ideeenZin = "";
  if (top.length === 3) {
    const conn = pick(turnId + "c", LIST_CONNECTORS);
    ideeenZin = `${persoonlijk} ${conn(top[0], top[1], top[2])}.`;
  } else if (top.length === 2) {
    ideeenZin = `${persoonlijk} zou ${top[0]} of ${top[1]} leuk zijn.`;
  } else if (top.length === 1) {
    ideeenZin = `${persoonlijk} dacht ik aan ${top[0]}.`;
  }

  let vervolgZin = "";
  if (existingReminder) {
    vervolgZin = "Er staat trouwens al een herinnering voor klaar.";
  } else if (reminderIso) {
    const when = formatDutchWhen(reminderIso);
    vervolgZin = when
      ? `Zal ik je ${when} een seintje geven om iets te kopen?`
      : `Zal ik je een paar dagen van tevoren een seintje geven?`;
  }

  return [opener, ideeenZin, vervolgZin].filter(Boolean).join(" ").trim();
}

/* ---------------- Clarify-samenvatting ---------------- */

const CLARIFY_QUESTIONS: Record<AskField, string[]> = {
  age: [
    "Hoe oud wordt {who}?",
    "Voor welke leeftijd zoeken we iets?",
    "Hoe oud is {who} ongeveer?",
  ],
  interests: [
    "Waar is {who} dol op?",
    "Wat vindt {who} de leukste dingen?",
    "Waar wordt {who} blij van?",
  ],
  budget: [
    "Heb je een budget in gedachten?",
    "Wat wil je ongeveer uitgeven?",
  ],
  who: [
    "Voor wie is het cadeautje?",
  ],
};

const CLARIFY_OPENERS_NEW = [
  "Leuk!",
  "Wat gezellig.",
  "Ah, fijn dat je het noemt —",
];

export function buildClarifyQuestion(args: {
  turnId: string;
  who: string;
  field: AskField;
  isContinuation: boolean;
}): string {
  const { turnId, who, field, isContinuation } = args;
  const opener = isContinuation
    ? pick(turnId, ["Helder.", "Oké,", "Top —"])
    : pick(turnId, CLARIFY_OPENERS_NEW);
  const template = pick(turnId + ":" + field, CLARIFY_QUESTIONS[field]);
  const filled = template.replace(
    /\{who\}/g,
    who && who !== "het feestje" ? who.toLowerCase() : "het kind",
  );
  return `${opener} ${filled}`;
}

/* ---------------- Helpers ---------------- */

const SPELLED: Record<number, string> = {
  1: "één", 2: "twee", 3: "drie", 4: "vier", 5: "vijf", 6: "zes",
  7: "zeven", 8: "acht", 9: "negen", 10: "tien", 11: "elf", 12: "twaalf",
};

function spelledAge(n: number): string {
  return SPELLED[n] ?? String(n);
}

const DUTCH_DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

function formatDutchWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? DUTCH_DAYS[d.getDay()];
  const hh = parts.find((p) => p.type === "hour")?.value ?? "09";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (mm === "00") return `${weekday}ochtend om ${parseInt(hh, 10)} uur`;
  return `${weekday} om ${hh}:${mm}`;
}

export function detectMissingField(input: GiftEventInput): AskField | null {
  if (!input.age) return "age";
  if (!input.interests || input.interests.length === 0) return "interests";
  // Budget is optioneel — vraag pas als je échte luxe-ideeën nodig hebt.
  return null;
}

export type { GiftEventInput };
