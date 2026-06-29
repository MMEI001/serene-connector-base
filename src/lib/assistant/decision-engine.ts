/**
 * Decision Engine — kiest welke Proposals daadwerkelijk uitgevoerd worden.
 *
 * Sprint 1: respecteer persona.maxSuggestions als bovengrens en behoud volgorde.
 * Later: leidraad uit Productprincipes + Thinking Layer (bv. nooit twee
 * reminders binnen 15 min, of stille uren respecteren).
 */

import type { Conversation, Decision, EngineContext, Proposal } from "./types";

export function decide(
  ctx: EngineContext,
  _conv: Conversation,
  proposals: Proposal[],
): Decision {
  const cap = Math.max(1, ctx.persona.hints.maxSuggestions);
  const chosen = proposals.slice(0, Math.max(cap, 3));
  return {
    proposals: chosen,
    reason: chosen.length === proposals.length ? "all_kept" : `capped_at_${cap}`,
  };
}
