/**
 * HoofdRust Intelligence Framework — gedeelde contracten.
 *
 * Iedere AI-interactie loopt via runAssistantTurn() en doorloopt zeven
 * engines in vaste volgorde. Skills (release, reminder, event, query, ...)
 * bevatten geen eigen AI-logica meer — ze leveren alleen een adapter aan
 * de Suggestion- en Execution-engine.
 *
 * Deze sprint definieert de contracten + een dunne orchestrator. De engines
 * delegeren waar mogelijk naar bestaande voice-modules zodat we niets breken.
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

/** Resultaat van Conversation Engine: wat wil de gebruiker écht? */
export type Conversation = {
  /** Originele tekst, getrimmed. */
  text: string;
  /** Gemini-classificatie: 1..n acties met intent + payload. */
  actions: VoiceAction[];
  /** Primaire intent (eerste actie). */
  primary: VoiceIntent;
  /** Optionele adviserende reactie (assistant_chat). */
  assistantReply?: string;
  meta: {
    model: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
  };
};

/** Memory-hit — nu nog stub, later: dynamische voorkeuren/gewoontes. */
export type MemoryHit = {
  key: string;
  value: string;
  confidence: number;
};

/** Lichte snapshot van wat er vandaag/komend speelt — voedt Suggestion + Query. */
export type ContextSnapshot = {
  todayCount: number;
  nextEvent?: { title: string; whenIso: string } | null;
};

/** Een Proposal is een potentiële actie — nog niet besloten, nog niet uitgevoerd. */
export type Proposal = {
  /** Welke skill levert dit voorstel. */
  skill: VoiceIntent;
  /** Payload zoals de bestaande handlers verwachten. */
  payload: Record<string, unknown>;
  /** Vereist deze actie expliciete bevestiging? */
  requiresConsent: boolean;
  /** Korte preview voor logging/observability. */
  rationale?: string;
};

/** Initiative-beslissing: mag HoofdRust nu proactief iets opperen? */
export type Initiative = {
  allow: boolean;
  reason: string;
};

/** Decision Engine output: welke proposals voeren we uit (of: laten we bevestigen)? */
export type Decision = {
  proposals: Proposal[];
  /** Korte uitleg voor logging. */
  reason: string;
};

/** Eindresultaat van één turn — wrapper rond bestaande PipelineResult. */
export type AssistantTurn = {
  result: PipelineResult;
  trace: EngineTrace;
};

/** Observability: welke engines deden wat. Wordt opgeslagen in voice_intents.payload. */
export type EngineTrace = {
  conversation?: { primary: VoiceIntent; actions: number; model: string };
  memory?: { hits: number; signature: string };
  context?: { todayCount: number };
  initiative?: Initiative;
  suggestion?: { proposals: number };
  decision?: { proposals: number; reason: string };
  execution?: { status: ActionResult["status"]; intent: VoiceIntent };
};
