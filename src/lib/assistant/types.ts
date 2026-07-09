/**
 * HoofdRust Intelligence Framework — gedeelde contracten.
 *
 * Iedere AI-interactie loopt via runAssistantTurn() en doorloopt zeven
 * engines in vaste volgorde. Skills (release, reminder, event, query, ...)
 * bevatten geen eigen AI-logica meer — ze leveren alleen een adapter aan
 * de Suggestion- en Execution-engine.
 *
 * Sprint 2: contracten uitgebreid met een rijke, PRIVACY-VEILIGE EngineTrace
 * (tellingen, signatures, redenen-enum, timings). Geen transcript-tekst,
 * geen titels, geen datums, geen reply-tekst.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserPersona } from "@/lib/voice/persona";
import type {
  ActionResult,
  PipelineResult,
  VoiceAction,
  VoiceIntent,
} from "@/lib/voice/types";

/** Ruwe invoer voor één assistent-turn. */
export type AssistantInput = {
  text: string;
  transcription_id?: string | null;
  /** Recente conversatie-turns (client-side session history). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

/** Door alle engines gedeelde context. */
export type EngineContext = {
  supabase: SupabaseClient;
  userId: string;
  /** Wandklok-tijd voor deze turn (Europe/Amsterdam). */
  now: Date;
  /** Statische voorkeuren uit onboarding (Memory Engine v0). */
  persona: UserPersona;
  /** Optionele dynamische memory-hits (later sprint). */
  memoryHits?: MemoryHit[];
  /** Lichtgewicht snapshot van agenda/reminders (Context Engine). */
  snapshot?: ContextSnapshot;
};

/** Resultaat van Conversation Engine. */
export type Conversation = {
  text: string;
  actions: VoiceAction[];
  primary: VoiceIntent;
  assistantReply?: string;
  meta: {
    model: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
  };
};

/** Memory-hit — privacy: alleen key + confidence, nooit value. */
export type MemoryHit = {
  key: string;
  source: "persona" | "dynamic";
  confidence: number;
};

export type FreeTimeBlock = {
  start: string; // "10:30"
  end: string;   // "12:00"
  durationMinutes: number;
};

export type NextAppointmentCompact = {
  title: string;
  whenIso: string; // "2026-06-29T14:00"
  date: string;
  startTime: string;
};

export type ContextCategoryCount = {
  category:
    | "appointments_today"
    | "next_appointment"
    | "free_time_blocks"
    | "open_reminders"
    | "relevant_memories"
    | "upcoming_birthdays"
    | "travel_time"
    | "time_context";
  count: number;
};

/** Compacte snapshot van wat er op dit moment en vandaag relevant is. */
export type ContextSnapshot = {
  todayCount: number;
  nextEvent?: NextAppointmentCompact | null;
  upcomingEvents: NextAppointmentCompact[];
  freeBlocksToday: FreeTimeBlock[];
  openRemindersCount: number;
  relevantMemoriesCount: number;
  memoriesCountByCategory: Record<string, number>;
  upcomingBirthdaysCount: number;
  travelTimeAvailable: boolean;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  dayOfWeek: "maandag" | "dinsdag" | "woensdag" | "donderdag" | "vrijdag" | "zaterdag" | "zondag";
  categories: ContextCategoryCount[];
};

/** Vast vocabulaire van redenen — voorkomt vrij-tekst lekken in trace. */
export type RejectionReason =
  | "over_cap"
  | "duplicate"
  | "persona_quiet"
  | "requires_consent_outside_chat_only"
  | "unsupported_skill"
  | "below_opportunity_threshold";

export type InitiativeReason =
  | "direct_intent"
  | "persona_quiet"
  | "advisory_question";

/**
 * Sprint 3 — Opportunity Score (0..4): intern signaal voor de Decision Engine
 * over hoeveel toegevoegde waarde een proactief voorstel zou hebben.
 *  0 = alleen antwoord
 *  1 = klein praktisch advies
 *  2 = advies + 1 slimme suggestie
 *  3 = advies + voorstel voor reminder/notitie
 *  4 = advies + meerdere logische vervolgstappen
 */
export type OpportunityScore = 0 | 1 | 2 | 3 | 4;

/** Type hulp dat past bij de score — sturend voor Decision/Suggestion. */
export type HelpKind =
  | "none"
  | "advice_only"
  | "advice_plus_suggestion"
  | "advice_plus_followup"
  | "advice_plus_multistep";

/**
 * Vast vocabulaire van motivaties achter de Opportunity Score.
 * Privacy-veilig: enum, geen vrije tekst, geen transcript-fragmenten.
 */
export type OpportunityReason =
  | "direct_intent"
  | "advisory_question"
  | "future_time_marker"
  | "user_may_forget"
  | "agenda_has_room"
  | "agenda_is_busy"
  | "location_makes_sense"
  | "similar_prior_behavior"
  | "low_confidence"
  | "persona_quiet"
  | "suggested_actions_present"
  | "no_actionable_followup"
  | "experience_gift_event"
  | "existing_followup_present"
  | "needs_clarification"
  | "continuation_turn";


/** Een Proposal is een potentiële actie — nog niet besloten. */
export type Proposal = {
  skill: VoiceIntent;
  payload: Record<string, unknown>;
  requiresConsent: boolean;
  rationale?: "direct_intent" | "assistant_suggested";
};

export type Initiative = {
  allow: boolean;
  reason: InitiativeReason;
  /** Sprint 3 — interne kansscore (0..4). */
  score: OpportunityScore;
  /** Type hulp dat bij de score past. */
  helpKind: HelpKind;
  /** Enum-motivaties achter de score (max 4). */
  reasons: OpportunityReason[];
};


export type RejectedProposal = {
  skill: VoiceIntent;
  reason: RejectionReason;
};

export type Decision = {
  proposals: Proposal[];
  rejections: RejectedProposal[];
  reason: string;
};

/** Eindresultaat van één turn. */
export type AssistantTurn = {
  result: PipelineResult;
  trace: EngineTrace;
  /** De acties die door de Decision Engine zijn doorgelaten (voor persistence). */
  chosenActions: VoiceAction[];
};

/**
 * Observability — uitlegbaar denken. PRIVACY-VEILIG: alleen tellingen,
 * enum-redenen, signatures, timings. Geen ruwe gebruikersdata.
 */
export type EngineTrace = {
  /** Korrelig ID per turn, voor cross-ref met voice_intents. */
  turn_id: string;
  /** "framework" of "legacy" — welk pad heeft deze turn afgehandeld. */
  framework: "assistant" | "legacy";
  /** Totale doorlooptijd in ms. */
  total_ms: number;
  /** Naam van de engine met de hoogste ms. */
  slowest_engine: string;

  conversation?: {
    primary: VoiceIntent;
    actions_count: number;
    model: string;
    ambiguous: boolean;
    ms: number;
  };
  memory?: {
    persona_signature: string;
    hits_count: number;
    sources: Array<"persona" | "dynamic">;
    ms: number;
  };
  /** Sprint 6 — Persistent Memory v1 write-back. */
  memory_writeback?: {
    handled_confirmation: boolean;
    created_pending: boolean;
    category: string | null;
    future_value: number | null;
    active_records_count: number;
    ms: number;
  };
  context?: {
    today_count: number;
    has_next_event: boolean;
    snapshot_keys: string[];
    categories?: Array<{ category: string; count: number }>;
    ms: number;
  };
  initiative?: Initiative & {
    ms: number;
    /** Sprint 3 — gekopieerd voor snelle filter/aggregatie zonder spread-typing. */
    score: OpportunityScore;
    help_kind: HelpKind;
    reasons: OpportunityReason[];
  };
  suggestion?: {
    proposals_count: number;
    skills: VoiceIntent[];
    ms: number;
  };

  decision?: {
    kept: number;
    rejected: number;
    rejection_reasons: RejectionReason[];
    reason: string;
    ms: number;
  };
  execution?: {
    status: ActionResult["status"];
    intent: VoiceIntent;
    used_fallback: boolean;
    ms: number;
  };
  experience?: {
    kind: "gift_event";
    /** "clarify" = HoofdRust vroeg eerst om context. "results" = direct ideeën + reminder. */
    mode: "clarify" | "results";
    /** Welk veld de Conversation Engine miste en daarom opvroeg. */
    asked_field?: "age" | "interests" | "budget" | "who" | null;
    /** Aantal clarify-rondes in deze experience (inclusief deze). */
    clarify_count?: number;
    /** Lag er state klaar uit een vorige turn? */
    had_state?: boolean;
    /** Hoe oud (ms) was die state, null = geen state. */
    state_age_ms?: number | null;
    /** True als deze turn een vervolg-zin op een lopende experience was. */
    is_continuation?: boolean;
    had_existing_event: boolean;
    had_existing_reminder: boolean;
    ideas_count: number;
    memory_used_count?: number;
    ms: number;
  };

};
