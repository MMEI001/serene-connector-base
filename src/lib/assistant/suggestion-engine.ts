/**
 * Suggestion Engine — vertaalt Conversation-output naar concrete Proposals.
 *
 * Sprint 1: gebruikt de bestaande logica uit voice-pipeline (slimme defaults
 * voor titel/tijd, dedupe, subtekst uit assistant-reply). We isoleren dit
 * achter één functie zodat later skills hier hun eigen sub-suggester kunnen
 * inpluggen (cadeau, restaurant, kapper, ...).
 */

import type { VoiceAction, VoiceIntent } from "@/lib/voice/types";
import type { Conversation, EngineContext, Proposal } from "./types";

const CONFIRMABLE: ReadonlySet<VoiceIntent> = new Set(["reminder", "event", "note"]);

export function propose(
  _ctx: EngineContext,
  conv: Conversation,
): Proposal[] {
  // Directe intents (release/reminder/event/query/note/checkin) → één-op-één
  // doorzetten als Proposal. De skill bepaalt zelf of consent nodig is.
  if (conv.primary !== "assistant_chat") {
    return conv.actions.map((a) => toProposal(a));
  }

  // assistant_chat: pak suggested_actions uit de reply.
  const primary = conv.actions[0];
  const suggestedRaw = primary?.payload.suggested_actions;
  if (!Array.isArray(suggestedRaw) || suggestedRaw.length === 0) {
    // Alleen reply → één "doe niets behalve praten"-proposal.
    return [toProposal(primary)];
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

function toProposal(action: VoiceAction): Proposal {
  return {
    skill: action.intent,
    payload: action.payload,
    requiresConsent: action.intent === "reminder" || action.intent === "event",
    rationale: "direct_intent",
  };
}
