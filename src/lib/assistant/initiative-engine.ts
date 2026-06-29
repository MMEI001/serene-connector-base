/**
 * Initiative Engine — beslist of HoofdRust proactief iets mag voorstellen.
 * Nooit opdringerig: alleen wanneer een suggested_action duidelijk waarde
 * toevoegt en de persona het toelaat (rust > volume).
 *
 * Sprint 1: simpele regels. Later: leren op basis van accept/decline-ratio.
 */

import type { Conversation, EngineContext, Initiative } from "./types";

export function shouldTakeInitiative(
  ctx: EngineContext,
  conv: Conversation,
): Initiative {
  // Geen initiatief als de gebruiker een directe opdracht gaf — voer die uit.
  if (conv.primary !== "assistant_chat") {
    return { allow: false, reason: "direct_intent" };
  }

  // Persona-respect: bij "minimal" of "overprikkeld vaak" geen extra voorstellen.
  const tone = ctx.persona.hints.tone;
  if (tone === "minimal" || ctx.persona.hints.maxSuggestions <= 1) {
    return { allow: false, reason: "persona_quiet" };
  }

  return { allow: true, reason: "advisory_question" };
}
