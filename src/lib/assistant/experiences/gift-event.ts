/**
 * Experience 001 — Kinderfeestje / gift_event.
 *
 * Sprint 5: adaptieve vragen, persoonlijkere ideeën, continuation-aware.
 *
 * Een Experience is een herkenbaar levenspatroon dat door het Intelligence
 * Framework als geheel wordt afgehandeld. Geen losse handler of route — we
 * verrijken alleen de bestaande engines:
 *   - Context: bestaat er al een agenda-item of reminder voor dit event?
 *   - Suggestion: één concrete reminder ("Cadeautje kopen voor X") als
 *     bevestigingsvoorstel, met datum = event − leadDays op 09:00.
 *   - Pipeline: voegt een experience_card (3 cadeau-ideeën) toe aan het
 *     resultaat zodat de UI hem boven de bevestigingsknoppen kan tonen.
 *
 * Geen DB-schrijfacties hier — de reminder blijft een voorstel tot de
 * gebruiker bevestigt via de bestaande needs_confirmation flow.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoiceAction } from "@/lib/voice/types";
import type { UserPersona } from "@/lib/voice/persona";
import type { AskField } from "./continuation";
import type { MemoryRecord } from "../memory/types";
import {
  buildClarifyQuestion,
  buildResultSummary,
  detectMissingField,
} from "./spoken-summary";

export type GiftEventInput = {
  who?: string;        // "dochter", "zoon", "Anne", ...
  event_type?: string; // "kinderfeestje", "verjaardag", "bruiloft"
  iso_datetime?: string; // ISO 8601 (event-dag)
  age?: number;
  interests?: string[];
  budget?: number;
  budget_currency?: string;
};

export type GiftEventClarifyOutcome = {
  mode: "clarify";
  askedField: AskField;
  question: string;
  spokenSummary: string;
};

export type GiftEventResultOutcome = {
  mode: "results";
  ideas: string[];
  existingAppointmentId: string | null;
  existingReminderId: string | null;
  leadDays: number;
  reminderAction: VoiceAction | null;
  spokenSummary: string;
  card: {
    kind: "gift_event";
    who: string;
    eventLabel: string;
    whenIso: string | null;
    ideas: string[];
    existingReminder: boolean;
  };
};

export type GiftEventOutcome = GiftEventClarifyOutcome | GiftEventResultOutcome;

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const DEFAULT_LEAD_DAYS = 3;
const MAX_CLARIFY_ROUNDS = 2;

const PARTY_KEYWORDS = ["kinderfeest", "feestje", "verjaard", "partij"];

function amsterdamIso(d: Date, hour = 9, minute = 0): string {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
  const date = new Date(utc);
  const tz =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Amsterdam",
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = tz.match(/GMT([+-]\d+)/);
  const oh = m ? parseInt(m[1], 10) : 1;
  const sign = oh >= 0 ? "+" : "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.abs(oh))}:00`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

async function generateIdeas(
  input: GiftEventInput,
  persona?: UserPersona,
  memoryRecords: MemoryRecord[] = [],
): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return defaultIdeas(input);

  const ageHint = input.age ? `${input.age} jaar` : "leeftijd onbekend";
  const budgetHint = input.budget
    ? `${input.budget} ${input.budget_currency ?? "EUR"}`
    : "ca. 15–25 EUR";
  const interestsHint = input.interests?.length
    ? input.interests.join(", ")
    : "onbekend";
  const toneHint = persona?.hints.tone === "minimal" ? "extra beknopt" : "warm en concreet";

  const sys = `Je geeft drie korte, concrete cadeau-ideeën in het Nederlands.
Regels:
- Max 6 woorden per idee.
- Geen merknamen, geen prijzen, geen uitleg.
- Pas IDEEN aan op de gegeven leeftijd en interesses (cruciaal).
- Toon: ${toneHint}.
- Antwoord ALLEEN als JSON array van 3 strings, niets anders.`;
  const user = `Voor wie: ${input.who ?? "kind"}
Gelegenheid: ${input.event_type ?? "kinderfeestje"}
Leeftijd: ${ageHint}
Interesses: ${interestsHint}
Budget: ${budgetHint}`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return defaultIdeas(input);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return defaultIdeas(input);
    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return defaultIdeas(input);
    const ideas = arr
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    return ideas.length === 3 ? ideas : defaultIdeas(input);
  } catch (err) {
    console.warn("[gift-event] idea-gen failed", err);
    return defaultIdeas(input);
  }
}

function defaultIdeas(input: GiftEventInput): string[] {
  // Als we specifieke interesses (zoals uit memory) kennen, genereer logische default-tips
  if (input.interests?.length) {
    const firstInterest = capitalize(input.interests[0]);
    return [
      `${firstInterest} speelset of figuur`,
      `Boek over ${input.interests[0]}`,
      `Knutselset met ${input.interests[0]}thema`,
    ];
  }
  const age = input.age ?? 7;
  if (age <= 4) return ["Houten puzzel", "Knuffel of stoffen boekje", "Speel-keukenset"];
  if (age <= 8) return ["Knutselset of tekenpakket", "Voorleesboek met avontuur", "Bouwspeelgoed of puzzel"];
  if (age <= 12) return ["Creatief experimenteer-set", "Leesboek voor zijn/haar leeftijd", "Buitenspel of sport-cadeau"];
  return ["Een mooi boek", "Bloemen of een plant", "Cadeaubon voor iets leuks"];
}

/**
 * Zoek of er al een appointment / reminder in de buurt van het event staat.
 */
async function lookupExisting(
  supabase: SupabaseClient,
  userId: string,
  whenIso: string | null,
): Promise<{ appointmentId: string | null; reminderId: string | null }> {
  if (!whenIso) return { appointmentId: null, reminderId: null };
  const eventDate = new Date(whenIso);
  if (Number.isNaN(eventDate.getTime())) return { appointmentId: null, reminderId: null };

  const start = new Date(eventDate);
  start.setDate(start.getDate() - 1);
  const end = new Date(eventDate);
  end.setDate(end.getDate() + 1);
  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);

  const [{ data: appts }, { data: rems }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id,title")
      .eq("user_id", userId)
      .gte("date", startDay)
      .lte("date", endDay),
    supabase
      .from("reminders")
      .select("id,title,remind_at")
      .eq("user_id", userId)
      .gte("remind_at", new Date(+eventDate - 8 * 86400000).toISOString())
      .lte("remind_at", new Date(+eventDate + 86400000).toISOString()),
  ]);

  const matchAppt = (appts ?? []).find((a) => {
    const t = String(a.title ?? "").toLowerCase();
    return PARTY_KEYWORDS.some((k) => t.includes(k));
  });
  const matchRem = (rems ?? []).find((r) => {
    const t = String(r.title ?? "").toLowerCase();
    return t.includes("cadeau") || t.includes("gift");
  });

  return {
    appointmentId: (matchAppt?.id as string | undefined) ?? null,
    reminderId: (matchRem?.id as string | undefined) ?? null,
  };
}

export type RunGiftEventOpts = {
  persona?: UserPersona;
  memoryRecords?: MemoryRecord[];
  /** Aantal eerdere clarify-rondes voor deze experience. */
  clarifyCount?: number;
  /** Of dit een vervolgturn is binnen dezelfde experience (continuation). */
  isContinuation?: boolean;
  /** Stabiele id voor deterministische TTS-variatie. */
  turnId?: string;
};

export async function runGiftEvent(
  supabase: SupabaseClient,
  userId: string,
  input: GiftEventInput,
  now: Date,
  opts: RunGiftEventOpts = {},
): Promise<GiftEventOutcome> {
  const whenIso = typeof input.iso_datetime === "string" ? input.iso_datetime : null;
  const whoRaw = (input.who ?? "").trim();
  const who = capitalize(whoRaw) || "het feestje";
  const eventLabel = (input.event_type ?? "kinderfeestje").trim();
  const turnId = opts.turnId ?? `t_${now.getTime()}`;
  const isContinuation = !!opts.isContinuation;
  const clarifyCount = opts.clarifyCount ?? 0;

  // 1. Adaptieve vraag — alleen als persona "wel mag" doorvragen, en we
  //    nog niet te vaak hebben doorgevraagd.
  const allowFollowup = opts.persona?.hints.allowFollowupQuestion !== false;
  const missing = detectMissingField(input);
  if (missing && allowFollowup && clarifyCount < MAX_CLARIFY_ROUNDS) {
    const question = buildClarifyQuestion({
      turnId,
      who,
      field: missing,
      isContinuation,
    });
    return {
      mode: "clarify",
      askedField: missing,
      question,
      spokenSummary: question,
    };
  }

  // 2. Context-lookup parallel met idee-generatie.
  const [existing, ideas] = await Promise.all([
    lookupExisting(supabase, userId, whenIso),
    generateIdeas(input, opts.persona),
  ]);

  // 3. Bepaal reminder-datum (event − leadDays, niet in het verleden).
  let reminderAction: VoiceAction | null = null;
  let reminderIso: string | null = null;
  if (whenIso && !existing.reminderId) {
    const eventDate = new Date(whenIso);
    if (!Number.isNaN(eventDate.getTime()) && eventDate.getTime() > now.getTime()) {
      const reminderDate = new Date(eventDate);
      reminderDate.setDate(reminderDate.getDate() - DEFAULT_LEAD_DAYS);
      const minDate = new Date(now);
      minDate.setDate(minDate.getDate() + 1);
      minDate.setHours(0, 0, 0, 0);
      if (reminderDate < minDate) reminderDate.setTime(minDate.getTime());

      const title = `Cadeautje kopen voor ${who}`;
      const description = `Ideeën: ${ideas.join(" · ")}`;
      reminderIso = amsterdamIso(reminderDate, 9, 0);

      reminderAction = {
        intent: "reminder",
        payload: {
          title,
          iso_datetime: reminderIso,
          description,
          related_appointment_id: existing.appointmentId ?? undefined,
        },
        confidence: 0.85,
      };
    }
  }

  const spokenSummary = buildResultSummary({
    turnId,
    who,
    age: input.age,
    ideas,
    whenIso,
    reminderIso,
    existingReminder: !!existing.reminderId,
    isContinuation,
  });

  return {
    mode: "results",
    ideas,
    existingAppointmentId: existing.appointmentId,
    existingReminderId: existing.reminderId,
    leadDays: DEFAULT_LEAD_DAYS,
    reminderAction,
    spokenSummary,
    card: {
      kind: "gift_event",
      who,
      eventLabel,
      whenIso,
      ideas,
      existingReminder: !!existing.reminderId,
    },
  };
}

export function isGiftEventConv(payload: Record<string, unknown>): GiftEventInput | null {
  const exp = payload.experience;
  if (exp !== "gift_event") return null;
  const data = payload.experience_data;
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  return {
    who: typeof d.who === "string" ? d.who : undefined,
    event_type: typeof d.event_type === "string" ? d.event_type : undefined,
    iso_datetime: typeof d.iso_datetime === "string" ? d.iso_datetime : undefined,
    age: typeof d.age === "number" ? d.age : undefined,
    interests: Array.isArray(d.interests)
      ? (d.interests.filter((x) => typeof x === "string") as string[])
      : undefined,
    budget: typeof d.budget === "number" ? d.budget : undefined,
    budget_currency: typeof d.budget_currency === "string" ? d.budget_currency : undefined,
  };
}
