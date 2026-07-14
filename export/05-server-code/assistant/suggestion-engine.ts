/**
 * Suggestion Engine — vertaalt Conversation-output naar concrete Proposals.
 *
 * Sprint 2: Proposal.rationale gebruikt enum-waarden zodat de trace
 * uitlegbaar wordt zonder ruwe tekst.
 */

import type { VoiceAction, VoiceIntent } from "@/lib/voice/types";
import type { Conversation, EngineContext, Proposal } from "./types";

const CONFIRMABLE: ReadonlySet<VoiceIntent> = new Set(["reminder", "event", "note"]);

export function propose(
  _ctx: EngineContext,
  conv: Conversation,
): Proposal[] {
  if (conv.primary !== "assistant_chat") {
    return conv.actions.map((a) => toProposal(a, "direct_intent"));
  }

  const primary = conv.actions[0];
  const suggestedRaw = primary?.payload.suggested_actions;
  if (!Array.isArray(suggestedRaw) || suggestedRaw.length === 0) {
    return primary ? [toProposal(primary, "direct_intent")] : [];
  }

  const proposals: Proposal[] = [];
  for (const s of suggestedRaw) {
    if (!s || typeof s !== "object") continue;
    const obj = s as { intent?: unknown; payload?: unknown };
    const intent = typeof obj.intent === "string" ? (obj.intent as VoiceIntent) : null;
    if (!intent || !CONFIRMABLE.has(intent)) continue;
    const payload =
      obj.payload && typeof obj.payload === "object"
        ? { ...(obj.payload as Record<string, unknown>) }
        : {};
    proposals.push({
      skill: intent,
      payload,
      requiresConsent: true,
      rationale: "assistant_suggested",
    });
  }
  return proposals;
}

function toProposal(
  action: VoiceAction,
  rationale: Proposal["rationale"],
): Proposal {
  return {
    skill: action.intent,
    payload: action.payload,
    requiresConsent: action.intent === "reminder" || action.intent === "event",
    rationale,
  };
}
