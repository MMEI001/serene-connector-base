/**
 * Orchestrator — runAssistantTurn() loopt zeven engines af in vaste volgorde:
 *
 *   Conversation → Memory → Context → Initiative → Suggestion → Decision → Execution
 *
 * Sprint 1: minimale implementatie die de bestaande voice-pipeline overneemt
 * zonder gedragverandering. Output blijft PipelineResult-compatible zodat de
 * orb-UI en bevestigingskaart ongewijzigd blijven werken.
 *
 * runVoicePipeline() in src/lib/voice-pipeline.functions.ts roept deze
 * orchestrator aan en blijft verantwoordelijk voor persistentie van
 * voice_actions (needs_confirmation + audit log).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { understand } from "./conversation-engine";
import { recall, remember } from "./memory-engine";
import { snapshot } from "./context-engine";
import { shouldTakeInitiative } from "./initiative-engine";
import { propose } from "./suggestion-engine";
import { decide } from "./decision-engine";
import { execute } from "./execution-engine";
import type {
  AssistantInput,
  AssistantTurn,
  EngineContext,
  EngineTrace,
} from "./types";

export async function runAssistantTurn(
  supabase: SupabaseClient,
  userId: string,
  input: AssistantInput,
): Promise<AssistantTurn> {
  const now = new Date();
  const trace: EngineTrace = {};

  // 1. Memory — laad persona (statische voorkeuren).
  const { persona, hits } = await recall(supabase, userId);
  trace.memory = { hits: hits.length, signature: persona.signature };

  // 2. Context — lichte snapshot voor downstream engines.
  const snap = await snapshot(supabase, userId, now);
  trace.context = { todayCount: snap.todayCount };

  const ctx: EngineContext = {
    supabase,
    userId,
    now,
    persona,
    memoryHits: hits,
    snapshot: snap,
  };

  // 3. Conversation — begrijp wat de gebruiker écht wil.
  const conv = await understand(input.text, persona);
  trace.conversation = {
    primary: conv.primary,
    actions: conv.actions.length,
    model: conv.meta.model,
  };

  // 4. Initiative — mag HoofdRust proactief iets opperen?
  const initiative = shouldTakeInitiative(ctx, conv);
  trace.initiative = initiative;

  // 5. Suggestion — concrete proposals.
  const proposals = propose(ctx, conv);
  trace.suggestion = { proposals: proposals.length };

  // 6. Decision — welke proposals voeren we uit / vragen we te bevestigen?
  const decision = decide(ctx, conv, proposals);
  trace.decision = { proposals: decision.proposals.length, reason: decision.reason };

  // 7. Execution — voer uit (consent-handling gebeurt in caller).
  const result = await execute(ctx, decision);
  trace.execution = { status: result.status, intent: result.intent };

  // assistant_chat reply doorzetten voor TTS/UI.
  if (conv.assistantReply) {
    result.assistant_reply = conv.assistantReply;
  }

  // 8. Memory write-back (no-op in sprint 1).
  void remember(supabase, userId, conv);

  return { result, trace };
}

/** Re-export voor convenience. */
export type { AssistantTurn } from "./types";
