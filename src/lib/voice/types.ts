// Frozen contract — fase B vult `processVoiceInput` met GPT, signature blijft gelijk.

export type VoiceIntent =
  | "release"
  | "reminder"
  | "note"
  | "event"
  | "query"
  | "checkin";

export type VoiceActionStatus =
  | "completed"
  | "needs_confirmation"
  | "failed"
  | "skipped";

export type VoiceAction = {
  intent: VoiceIntent;
  payload: Record<string, unknown>;
  confidence: number;
};

export type ActionResult = {
  intent: VoiceIntent;
  status: VoiceActionStatus;
  /** Korte bevestiging voor de orb-UI ("Losgelaten.", "Reminder gezet."). */
  confirmation: string;
  /** Verwijzing naar de aangemaakte rij, indien van toepassing. */
  ref?: { table: string; id: string };
  /** Foutmelding (alleen bij status=failed). */
  error?: string;
};

/** Pipeline-resultaat richting de client (orb-state). */
export type PipelineResult = ActionResult;
