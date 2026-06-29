/**
 * Experience 001 — Kinderfeestje / gift_event.
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

export type GiftEventInput = {
  who?: string;        // "dochter", "zoon", "Anne", ...
  event_type?: string; // "kinderfeestje", "verjaardag", "bruiloft"
  iso_datetime?: string; // ISO 8601 (event-dag)
  age?: number;
  interests?: string[];
  budget?: number;
  budget_currency?: string;
};

export type GiftEventOutcome = {
  ideas: string[];
  existingAppointmentId: string | null;
  existingReminderId: string | null;
  leadDays: number;
  reminderAction: VoiceAction | null;
  /** Korte gesproken samenvatting (1-2 zinnen) voor TTS. */
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

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const DEFAULT_LEAD_DAYS = 3;

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

async function generateIdeas(input: GiftEventInput): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return defaultIdeas(input);

  const ageHint = input.age ? `${input.age} jaar` : "leeftijd 6–8 (default)";
  const budgetHint = input.budget
    ? `${input.budget} ${input.budget_currency ?? "EUR"}`
    : "ca. 15–20 EUR";
  const interestsHint = input.interests?.length
    ? input.interests.join(", ")
    : "onbekend";

  const sys = `Je geeft drie korte, concrete cadeau-ideeën in het Nederlands.
Regels: max 6 woorden per idee, geen merknamen, geen prijzen, geen uitleg.
Antwoord ALLEEN als JSON array van 3 strings, niets anders.`;
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
  const isKid = (input.age ?? 7) <= 12;
  return isKid
    ? ["Knutselset of tekenpakket", "Boek of leeshoekje-cadeau", "Bouwspeelgoed of puzzel"]
    : ["Een mooi boek", "Bloemen of een plant", "Cadeaubon voor iets leuks"];
}

/**
 * Zoek of er al een appointment / reminder in de buurt van het event staat.
 * Lichte heuristiek: zelfde week + matching trefwoord.
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

export async function runGiftEvent(
  supabase: SupabaseClient,
  userId: string,
  input: GiftEventInput,
  now: Date,
): Promise<GiftEventOutcome> {
  const whenIso = typeof input.iso_datetime === "string" ? input.iso_datetime : null;
  const who = capitalize((input.who ?? "").trim()) || "het feestje";
  const eventLabel = (input.event_type ?? "kinderfeestje").trim();

  // 1. Context-lookup parallel met idee-generatie.
  const [existing, ideas] = await Promise.all([
    lookupExisting(supabase, userId, whenIso),
    generateIdeas(input),
  ]);

  // 2. Bepaal reminder-datum (event − leadDays, niet in het verleden).
  let reminderAction: VoiceAction | null = null;
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
      const iso = amsterdamIso(reminderDate, 9, 0);

      reminderAction = {
        intent: "reminder",
        payload: {
          title,
          iso_datetime: iso,
          description,
          related_appointment_id: existing.appointmentId ?? undefined,
        },
        confidence: 0.85,
      };
    }
  }

  return {
    ideas,
    existingAppointmentId: existing.appointmentId,
    existingReminderId: existing.reminderId,
    leadDays: DEFAULT_LEAD_DAYS,
    reminderAction,
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
