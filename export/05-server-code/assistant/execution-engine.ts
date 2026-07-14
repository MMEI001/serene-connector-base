/**
 * Execution Engine — voert besluiten uit via de bestaande handlers.
 * Acties die requiresConsent dragen worden NIET direct uitgevoerd; de
 * orchestrator zet ze als needs_confirmation in voice_actions zodat de
 * UI om bevestiging vraagt.
 *
 * Sprint 1: delegeert naar dispatchVoiceBundle. Bewaart het bestaande
 * commit-pad (commitVoiceBundle) intact voor de bevestigingsflow.
 */

import { dispatchVoiceBundle } from "@/lib/voice/dispatch-voice-action";
import type { ActionResult, VoiceAction } from "@/lib/voice/types";
import type { Decision, EngineContext } from "./types";

export async function execute(
  ctx: EngineContext,
  decision: Decision,
): Promise<ActionResult> {
  const actions: VoiceAction[] = decision.proposals.map((p) => ({
    intent: p.skill,
    payload: p.payload,
    confidence: 0.8,
  }));
  return dispatchVoiceBundle(
    { supabase: ctx.supabase, userId: ctx.userId, persona: ctx.persona },
    actions,
  );
}
