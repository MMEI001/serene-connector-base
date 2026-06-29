/**
 * Decision Engine — kiest welke Proposals daadwerkelijk uitgevoerd worden.
 *
 * Sprint 2: levert ook expliciete `rejections` met enum-reden zodat de
 * EngineTrace uitlegbaar wordt ("waarom is dit voorstel afgewezen?").
 */

import type {
  Conversation,
  Decision,
  EngineContext,
  Proposal,
  RejectedProposal,
} from "./types";

export function decide(
  ctx: EngineContext,
  _conv: Conversation,
  proposals: Proposal[],
): Decision {
  const cap = Math.max(1, ctx.persona.hints.maxSuggestions);
  const kept: Proposal[] = [];
  const rejections: RejectedProposal[] = [];
  const seen = new Set<string>();

  for (const p of proposals) {
    const key = `${p.skill}|${JSON.stringify(Object.keys(p.payload).sort())}`;
    if (seen.has(key)) {
      rejections.push({ skill: p.skill, reason: "duplicate" });
      continue;
    }
    if (kept.length >= cap) {
      rejections.push({ skill: p.skill, reason: "over_cap" });
      continue;
    }
    seen.add(key);
    kept.push(p);
  }

  return {
    proposals: kept,
    rejections,
    reason:
      rejections.length === 0
        ? "all_kept"
        : `kept_${kept.length}_rejected_${rejections.length}`,
  };
}
