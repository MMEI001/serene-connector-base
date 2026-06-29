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

/** Lichte snapshot van wat er vandaag speelt. */
export type ContextSnapshot = {
  todayCount: number;
  nextEvent?: { title: string; whenIso: string } | null;
};

/** Vast vocabulaire van redenen — voorkomt vrij-tekst lekken in trace. */
export type RejectionReason =
  | "over_cap"
  | "duplicate"
  | "persona_quiet"
  | "requires_consent_outside_chat_only"
  | "unsupported_skill";

export type InitiativeReason =
  | "direct_intent"
  | "persona_quiet"
  | "advisory_question";

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
  context?: {
    today_count: number;
    has_next_event: boolean;
    snapshot_keys: string[];
    ms: number;
  };
  initiative?: Initiative & { ms: number };
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
};
