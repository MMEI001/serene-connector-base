/**
 * Persona-laag: transformeert ruwe onboarding-antwoorden (user_profiles)
 * naar (a) een NL system-prompt fragment voor de classifier en
 * (b) gestructureerde hints voor de handlers (max suggesties, toon,
 * standaard lead-time voor reminders, intent-bias bij dubbelzinnigheid, ...).
 *
 * Pure module: geen I/O, deterministisch, makkelijk te testen.
 */

import type { VoiceIntent } from "./types";

export type PersonaTone = "soft" | "brief" | "thoughtful" | "minimal";

export type PersonaHints = {
  /** Hard cap op aantal items dat een query terug mag geven. */
  maxSuggestions: number;
  tone: PersonaTone;
  /**
   * Default uren-offset voor een reminder zonder eigen tijd, t.o.v. event-tijd.
   * `null` = geen automatische lead-time (klassiek gedrag).
   */
  reminderLeadHours: number | null;
  /** Standaard event-duur in minuten als er geen eindtijd is. */
  planningBufferMinutes: number;
  /** Voorkeurs-intents bij dubbelzinnige zinnen (eerste = sterkste). */
  intentBias: VoiceIntent[];
  /** Mag de AI een rustige tegenvraag stellen? */
  allowFollowupQuestion: boolean;
};

export type UserPersona = {
  hints: PersonaHints;
  /** NL fragment dat onder de bestaande system-prompt geplakt wordt. */
  promptFragment: string;
  /** Korte hash voor logging/A-B in voice_actions.payload.meta. */
  signature: string;
};

export type UserProfileLike = {
  primary_goal?: string[] | null;
  support_style?: string | null;
  overstimulation_level?: string | null;
  suggestion_count_preference?: string | null;
  preferred_help_area?: string[] | null;
  reminder_style?: string | null;
  planning_style?: string | null;
} | null;

const DEFAULT_HINTS: PersonaHints = {
  maxSuggestions: 3,
  tone: "soft",
  reminderLeadHours: null,
  planningBufferMinutes: 60,
  intentBias: [],
  allowFollowupQuestion: true,
};

function mapTone(supportStyle: string | null | undefined): PersonaTone {
  switch ((supportStyle ?? "").toLowerCase()) {
    case "kort en duidelijk":
      return "brief";
    case "meedenkend":
      return "thoughtful";
    case "zo min mogelijk":
      return "minimal";
    case "rustig en zacht":
    default:
      return "soft";
  }
}

function mapMaxSuggestions(pref: string | null | undefined, tone: PersonaTone, overwhelmed: boolean): number {
  if (overwhelmed) return 1; // harde cap bij "Heel vaak" overprikkeld
  switch ((pref ?? "").toLowerCase()) {
    case "eén tegelijk":
    case "een tegelijk":
      return 1;
    case "twee of drie":
      return 3;
    case "maakt me niet uit":
    default:
      return tone === "brief" || tone === "minimal" ? 2 : 3;
  }
}

function mapIntentBias(areas: string[] | null | undefined): VoiceIntent[] {
  if (!areas?.length) return [];
  const bias: VoiceIntent[] = [];
  const lc = areas.map((a) => a.toLowerCase());
  if (lc.includes("reminders")) bias.push("reminder");
  if (lc.includes("plannen")) bias.push("event");
  if (lc.includes("loslaten")) bias.push("release");
  if (lc.includes("notities")) bias.push("note");
  return bias;
}

function mapReminderLeadHours(style: string | null | undefined): number | null {
  switch ((style ?? "").toLowerCase()) {
    case "dag van tevoren":
      return 24;
    case "uur van tevoren":
      return 1;
    case "op de dag zelf":
      return 0;
    default:
      return null;
  }
}

function mapPlanningBuffer(style: string | null | undefined): number {
  switch ((style ?? "").toLowerCase()) {
    case "met buffer":
      return 90;
    case "strak":
      return 30;
    default:
      return 60;
  }
}

function describeTone(tone: PersonaTone): string {
  switch (tone) {
    case "brief":
      return "Kort en zakelijk. Max 1 zin. Geen vulwoorden, geen excuses.";
    case "minimal":
      return "Zo min mogelijk woorden. Alleen bevestiging, geen extra context.";
    case "thoughtful":
      return "Meedenkend. Mag één korte reflectievraag stellen.";
    case "soft":
    default:
      return "Rustig en zacht. Volledige maar warme zinnen.";
  }
}

export function buildUserPersona(profile: UserProfileLike): UserPersona {
  if (!profile) {
    return {
      hints: DEFAULT_HINTS,
      promptFragment: "",
      signature: "default",
    };
  }

  const tone = mapTone(profile.support_style);
  const overwhelmed = (profile.overstimulation_level ?? "").toLowerCase() === "heel vaak";
  const maxSuggestions = mapMaxSuggestions(profile.suggestion_count_preference, tone, overwhelmed);
  const intentBias = mapIntentBias(profile.preferred_help_area);
  const reminderLeadHours = mapReminderLeadHours(profile.reminder_style);
  const planningBufferMinutes = mapPlanningBuffer(profile.planning_style);
  const allowFollowupQuestion = !overwhelmed && tone !== "minimal";

  const hints: PersonaHints = {
    maxSuggestions,
    tone,
    reminderLeadHours,
    planningBufferMinutes,
    intentBias,
    allowFollowupQuestion,
  };

  const goals = (profile.primary_goal ?? []).filter(Boolean);
  const areas = (profile.preferred_help_area ?? []).filter(Boolean);

  const lines: string[] = ["GEBRUIKERSPROFIEL — pas je antwoord hierop aan:"];
  if (goals.length) lines.push(`- Doel met de app: ${goals.join(", ").toLowerCase()}.`);
  lines.push(`- Toon: ${describeTone(tone)}`);
  if (overwhelmed) {
    lines.push("- Overprikkeling: vaak — geen tegenvragen, geen emoji, max 1 suggestie.");
  } else if ((profile.overstimulation_level ?? "").toLowerCase() === "vaak") {
    lines.push("- Overprikkeling: vaak — houd het beknopt.");
  }
  lines.push(`- Max suggesties per query-antwoord: ${maxSuggestions}.`);
  if (areas.length) lines.push(`- Voorkeursgebieden: ${areas.join(", ").toLowerCase()}.`);
  if (intentBias.length) {
    lines.push(
      `- Bij dubbelzinnige zin (bv. "kopen morgen"): kies bij voorkeur ${intentBias[0]} boven andere intents.`,
    );
  }
  if (reminderLeadHours != null) {
    lines.push(
      `- Default herinnerings-lead (zonder eigen tijd): ${reminderLeadHours} uur vooraf.`,
    );
  }
  if (!allowFollowupQuestion) {
    lines.push("- Stel GEEN tegenvragen. Bij twijfel: maak je beste gok en bevestig.");
  }

  return {
    hints,
    promptFragment: lines.join("\n"),
    signature: shortSignature(hints),
  };
}

function shortSignature(h: PersonaHints): string {
  return [
    h.tone[0],
    `s${h.maxSuggestions}`,
    `l${h.reminderLeadHours ?? "x"}`,
    `b${h.planningBufferMinutes}`,
    h.intentBias.map((i) => i[0]).join("") || "x",
    h.allowFollowupQuestion ? "q" : "n",
  ].join("-");
}
