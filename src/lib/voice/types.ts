// Contracten voor de voice-pipeline (fase B + multi-action).

export type VoiceIntent =
  | "release"
  | "reminder"
  | "note"
  | "event"
  | "query"
  | "checkin"
  | "assistant_chat";

export type VoiceActionStatus =
  | "completed"
  | "needs_confirmation"
  | "failed"
  | "skipped";

export type VoiceAction = {
  intent: VoiceIntent;
  payload: Record<string, unknown>;
  confidence: number;
  ambiguous?: boolean;
  clarification_question?: string | null;
};

/** Eén regel in een query-resultaat (agenda + reminders). */
export type QueryItem = {
  id: string;
  kind: "appointment" | "reminder" | "ics_event";
  title: string;
  /** Geformatteerde Nederlandse tijd-/datum-tekst, bv. "vrijdag 14:00". */
  when: string;
  source: string;
  source_label?: string | null;
  external_url?: string | null;
};

export type QueryResult = {
  intro: string;
  items: QueryItem[];
};

/** Eén preview-lijn in een (mogelijk samengestelde) bevestigingsbundle. */
export type ActionPreview = {
  intent: VoiceIntent;
  /** Korte preview-regel, bv. "Woensdag 1 juli — Partijtje dochter". */
  preview: string;
};

export type ActionResult = {
  intent: VoiceIntent;
  status: VoiceActionStatus;
  /** Korte bevestiging voor de orb-UI ("Losgelaten.", "Reminder gezet."). */
  confirmation: string;
  /** Verwijzing naar de aangemaakte rij (bij completed). */
  ref?: { table: string; id: string };
  /** Foutmelding (alleen bij status=failed). */
  error?: string;

  // ---- needs_confirmation extras ----
  /** voice_actions.id om later te bevestigen / annuleren. */
  action_id?: string;
  /** Korte preview-tekst (eventueel multi-line, één regel per actie). */
  preview?: string;
  /** Gestructureerde previews — UI rendert als lijst. */
  previews?: ActionPreview[];
  /** Wanneer verloopt deze pending actie (ISO). */
  expires_at?: string;

  // ---- query extras ----
  query_result?: QueryResult;
  external_url?: string | null;

  // ---- assistant_chat extras ----
  /** Korte, adviserende reactie van de assistent (voor TTS + UI). */
  assistant_reply?: string;

  // ---- observability (alleen in dev/debug-mode mee) ----
  /** Privacy-veilige reasoning-trace van het Intelligence Framework. */
  engine_trace?: import("@/lib/assistant/types").EngineTrace;

  // ---- bewerkbare voorstel-velden (alleen bij needs_confirmation met 1 actie) ----
  editable?: {
    intent: "reminder" | "event";
    title: string;
    iso_datetime?: string;
    date?: string;
    start_time?: string;
  };
};

export type PipelineResult = ActionResult;
