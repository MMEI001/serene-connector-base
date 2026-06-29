/**
 * Orchestrator — runAssistantTurn() loopt zeven engines af in vaste volgorde:
 *
 *   Memory → Context → Conversation → Initiative → Suggestion → Decision → Execution
 *
 * Sprint 2: bouwt een rijke, privacy-veilige EngineTrace mee (tellingen,
 * timings, enum-redenen, signatures — geen ruwe gebruikersdata).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { understand } from "./conversation-engine";
import { recall, remember } from "./memory-engine";
import { snapshot } from "./context-engine";
import { shouldTakeInitiative } from "./initiative-engine";
import { propose } from "./suggestion-engine";
import { decide } from "./decision-engine";
import { execute } from "./execution-engine";
import { isGiftEventConv, runGiftEvent } from "./experiences/gift-event";
import type { ExperienceCardData } from "@/components/experience-card";
import type {
  AssistantInput,
  AssistantTurn,
  EngineContext,
  EngineTrace,
} from "./types";

async function withTiming<T>(fn: () => Promise<T> | T): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

function pickSlowest(timings: Record<string, number>): string {
  let slowest = "n/a";
  let max = -1;
  for (const [name, ms] of Object.entries(timings)) {
    if (ms > max) {
      max = ms;
      slowest = name;
    }
  }
  return slowest;
}

export async function runAssistantTurn(
  supabase: SupabaseClient,
  userId: string,
  input: AssistantInput,
): Promise<AssistantTurn> {
  const turnStart = performance.now();
  const now = new Date();
  const turn_id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const trace: EngineTrace = {
    turn_id,
    framework: "assistant",
    total_ms: 0,
    slowest_engine: "n/a",
  };
  const timings: Record<string, number> = {};

  // 1. Memory
  const mem = await withTiming(() => recall(supabase, userId));
  timings.memory = mem.ms;
  trace.memory = {
    persona_signature: mem.value.persona.signature,
    hits_count: mem.value.hits.length,
    sources: Array.from(new Set(mem.value.hits.map((h) => h.source))),
    ms: mem.ms,
  };

  // 2. Context
  const ctxSnap = await withTiming(() => snapshot(supabase, userId, now));
  timings.context = ctxSnap.ms;
  trace.context = {
    today_count: ctxSnap.value.todayCount,
    has_next_event: !!ctxSnap.value.nextEvent,
    snapshot_keys: Object.keys(ctxSnap.value),
    ms: ctxSnap.ms,
  };

  const ctx: EngineContext = {
    supabase,
    userId,
    now,
    persona: mem.value.persona,
    memoryHits: mem.value.hits,
    snapshot: ctxSnap.value,
  };

  // 3. Conversation
  const conv = await withTiming(() => understand(input.text, mem.value.persona));
  timings.conversation = conv.ms;
  trace.conversation = {
    primary: conv.value.primary,
    actions_count: conv.value.actions.length,
    model: conv.value.meta.model,
    ambiguous: conv.value.actions.some((a) => !!a.ambiguous),
    ms: conv.ms,
  };

  // 3b. Experience-detectie: rijke patronen verrijken de Conversation
  //     vóórdat Initiative/Suggestion eraan rekenen.
  let experienceCard: ExperienceCardData | null = null;
  const primary = conv.value.actions[0];
  const giftInput = primary ? isGiftEventConv(primary.payload) : null;
  if (giftInput) {
    const exp = await withTiming(() => runGiftEvent(supabase, userId, giftInput, now));
    timings.experience = exp.ms;
    trace.experience = {
      kind: "gift_event",
      had_existing_event: !!exp.value.existingAppointmentId,
      had_existing_reminder: !!exp.value.existingReminderId,
      ideas_count: exp.value.ideas.length,
      ms: exp.ms,
    };
    experienceCard = exp.value.card;
    // Voeg het reminder-voorstel toe als suggested_action zodat de
    // Suggestion Engine 'm als gewone Proposal oppakt.
    if (exp.value.reminderAction) {
      const existing = Array.isArray(primary.payload.suggested_actions)
        ? (primary.payload.suggested_actions as unknown[])
        : [];
      primary.payload.suggested_actions = [
        ...existing,
        {
          intent: exp.value.reminderAction.intent,
          payload: exp.value.reminderAction.payload,
        },
      ];
    }
  }

  // 4. Initiative (v2 — bepaalt ook Opportunity Score + motivaties)
  const init = await withTiming(() => shouldTakeInitiative(ctx, conv.value));
  timings.initiative = init.ms;
  trace.initiative = {
    ...init.value,
    ms: init.ms,
    score: init.value.score,
    help_kind: init.value.helpKind,
    reasons: init.value.reasons,
  };

  // 5. Suggestion
  const sug = await withTiming(() => propose(ctx, conv.value));
  timings.suggestion = sug.ms;
  trace.suggestion = {
    proposals_count: sug.value.length,
    skills: sug.value.map((p) => p.skill),
    ms: sug.ms,
  };

  // 6. Decision (krijgt initiative — Opportunity Score stuurt cap)
  const dec = await withTiming(() => decide(ctx, conv.value, sug.value, init.value));
  timings.decision = dec.ms;
  trace.decision = {
    kept: dec.value.proposals.length,
    rejected: dec.value.rejections.length,
    rejection_reasons: dec.value.rejections.map((r) => r.reason),
    reason: dec.value.reason,
    ms: dec.ms,
  };


  // 7. Execution
  const exec = await withTiming(() => execute(ctx, dec.value));
  timings.execution = exec.ms;
  trace.execution = {
    status: exec.value.status,
    intent: exec.value.intent,
    used_fallback: false,
    ms: exec.ms,
  };

  // assistant_chat reply doorzetten voor TTS/UI.
  const result = exec.value;
  if (conv.value.assistantReply) {
    result.assistant_reply = conv.value.assistantReply;
    if (result.status === "completed" && !result.query_result) {
      result.confirmation = conv.value.assistantReply;
    }
  }

  // Experience-kaart aan resultaat hangen — UI rendert 'm boven de bevestiging.
  if (experienceCard) {
    result.experience_card = experienceCard;
  }

  // Memory write-back (no-op sprint 1/2).
  void remember(supabase, userId, conv.value);

  trace.total_ms = Math.round(performance.now() - turnStart);
  trace.slowest_engine = pickSlowest(timings);
  result.engine_trace = trace;

  return { result, trace };
}

export type { AssistantTurn } from "./types";
