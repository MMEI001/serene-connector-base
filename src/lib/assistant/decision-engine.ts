/**
 * Decision Engine — kiest welke Proposals daadwerkelijk uitgevoerd worden.
 *
 * Sprint 2: levert ook expliciete `rejections` met enum-reden zodat de
 * EngineTrace uitlegbaar wordt ("waarom is dit voorstel afgewezen?").
 *
 * Sprint 3: respecteert de Opportunity Score uit Initiative Engine v2. Een
 * lage score (0/1) blokkeert DB-impacterende voorstellen ondanks dat de
 * persona er wel ruimte voor heeft — score-cap wint van persona-cap.
 */

import { scoreToProposalCap } from "./initiative-engine";
import type {
  Conversation,
  Decision,
  EngineContext,
  Initiative,
  Proposal,
  RejectedProposal,
} from "./types";

export function decide(
  ctx: EngineContext,
  _conv: Conversation,
  proposals: Proposal[],
  initiative?: Initiative,
): Decision {
  const personaCap = Math.max(0, ctx.persona.hints.maxSuggestions);
  const scoreCap = initiative ? scoreToProposalCap(initiative.score) : personaCap;
  const cap = Math.min(personaCap, scoreCap);

  const kept: Proposal[] = [];
  const rejections: RejectedProposal[] = [];
  const seen = new Set<string>();

  for (const p of proposals) {
    // Directe-intent proposals (geen consent nodig) lopen niet via score-cap.
    const isDirect = p.rationale === "direct_intent";

    const key = `${p.skill}|${JSON.stringify(Object.keys(p.payload).sort())}`;
    if (seen.has(key)) {
      rejections.push({ skill: p.skill, reason: "duplicate" });
      continue;
    }

    if (!isDirect && cap === 0) {
      rejections.push({ skill: p.skill, reason: "below_opportunity_threshold" });
      continue;
    }

    if (!isDirect && kept.filter((k) => k.rationale !== "direct_intent").length >= cap) {
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

