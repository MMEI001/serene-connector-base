/**
 * Initiative Engine v2 — Sprint 3.
 *
 * Bepaalt niet alleen of HoofdRust proactief mag handelen, maar óók hoeveel
 * toegevoegde waarde een voorstel zou hebben (Opportunity Score 0..4) en
 * welk type hulp daarbij past (HelpKind).
 *
 * De score is uitsluitend INTERN: stuurt de Decision Engine en wordt
 * privacy-veilig (enum-redenen + cijfer) meegegeven aan EngineTrace.
 * Verandert niets aan de gebruikersflow — pure intelligentielaag.
 */

import type {
  Conversation,
  EngineContext,
  HelpKind,
  Initiative,
  InitiativeReason,
  OpportunityReason,
  OpportunityScore,
} from "./types";

const MAX_REASONS = 4;

/** Map score → type hulp dat de Decision Engine mag overwegen. */
function scoreToHelpKind(score: OpportunityScore): HelpKind {
  switch (score) {
    case 0: return "none";
    case 1: return "advice_only";
    case 2: return "advice_plus_suggestion";
    case 3: return "advice_plus_followup";
    case 4: return "advice_plus_multistep";
  }
}

/** Map score → max aantal voorstellen dat Decision Engine mag bewaren. */
export function scoreToProposalCap(score: OpportunityScore): number {
  // 0/1 = puur tekst, geen DB-actie. 2 = 1 suggestie. 3 = 1. 4 = 2 stappen.
  return score <= 1 ? 0 : score === 4 ? 2 : 1;
}

/** Zoek lichte toekomst-markers in transcript — alleen voor scoring, niet getoond. */
const FUTURE_RE =
  /\b(morgen|overmorgen|vanavond|volgende\s+week|volgende\s+maand|straks|later|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d{1,2}[:.]\d{2}|om\s+\d{1,2}\s+uur)\b/i;

/** Lichte "ik ga vergeten"-marker. */
const FORGET_RE =
  /\b(vergeet|niet\s+vergeten|onthou(d)?|denk\s+eraan|herinner(?:\s+me)?)\b/i;

export function shouldTakeInitiative(
  ctx: EngineContext,
  conv: Conversation,
): Initiative {
  // 1. Directe opdracht? Geen proactieve score — gewoon uitvoeren.
  if (conv.primary !== "assistant_chat") {
    return buildInitiative({
      allow: false,
      reason: "direct_intent",
      score: 0,
      reasons: ["direct_intent"],
    });
  }

  const reasons: OpportunityReason[] = ["advisory_question"];

  // 2. Persona-rust → score 0/1, geen voorstellen.
  const tone = ctx.persona.hints.tone;
  const personaCap = ctx.persona.hints.maxSuggestions;
  if (tone === "minimal" || personaCap <= 0) {
    return buildInitiative({
      allow: false,
      reason: "persona_quiet",
      score: 1, // klein advies mag, voorstellen niet
      reasons: addReason(reasons, "persona_quiet"),
    });
  }

  // 3. Bouw score op aan de hand van signalen.
  let score = 1; // baseline: assistant_chat krijgt minstens "klein advies".

  const primary = conv.actions[0];
  const suggestedRaw = primary?.payload.suggested_actions;
  const hasSuggested = Array.isArray(suggestedRaw) && suggestedRaw.length > 0;
  if (hasSuggested) {
    score += 1;
    addReason(reasons, "suggested_actions_present");
  }

  if (FUTURE_RE.test(conv.text)) {
    score += 1;
    addReason(reasons, "future_time_marker");
  }

  if (FORGET_RE.test(conv.text)) {
    score = Math.min(4, score + 1);
    addReason(reasons, "user_may_forget");
  }

  // 4. Agenda-context kleurt de score (ruimte = meer initiatief mogelijk).
  const todayCount = ctx.snapshot?.todayCount ?? 0;
  if (todayCount === 0) {
    addReason(reasons, "agenda_has_room");
  } else if (todayCount >= 4) {
    // Drukke dag → niet méér voorstellen erbovenop.
    score = Math.min(score, 2);
    addReason(reasons, "agenda_is_busy");
  }

  // 5. Lage classifier-zekerheid drukt score; geen aannames doen.
  const confidence = primary?.confidence ?? 1;
  if (confidence < 0.4) {
    score = Math.min(score, 1);
    addReason(reasons, "low_confidence");
  }

  // 6. Geen actiegerichte vervolgstappen mogelijk → cap op advies-niveau.
  if (!hasSuggested && score >= 3) {
    score = 2;
    addReason(reasons, "no_actionable_followup");
  }

  // 7. Persona-cap is een harde bovengrens op het "type" hulp.
  if (personaCap === 1 && score > 2) score = 2;

  const clamped = Math.max(0, Math.min(4, score)) as OpportunityScore;

  return buildInitiative({
    allow: clamped >= 2,
    reason: "advisory_question",
    score: clamped,
    reasons: reasons.slice(0, MAX_REASONS),
  });
}

function buildInitiative(opts: {
  allow: boolean;
  reason: InitiativeReason;
  score: OpportunityScore;
  reasons: OpportunityReason[];
}): Initiative {
  return {
    allow: opts.allow,
    reason: opts.reason,
    score: opts.score,
    helpKind: scoreToHelpKind(opts.score),
    reasons: opts.reasons,
  };
}

function addReason(
  list: OpportunityReason[],
  r: OpportunityReason,
): OpportunityReason[] {
  if (!list.includes(r) && list.length < MAX_REASONS) list.push(r);
  return list;
}
