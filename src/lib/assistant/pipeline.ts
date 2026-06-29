/**
 * Orchestrator — runAssistantTurn() loopt zeven engines af in vaste volgorde:
 *
 *   Memory → Context → Conversation → Initiative → Suggestion → Decision → Execution
 *
 * Sprint 2: bouwt een rijke, privacy-veilige EngineTrace mee.
 * Sprint 3: Initiative Engine v2 (Opportunity Score).
 * Sprint 4: Experience 001 — gift_event.
 * Sprint 5: continuation-aware experiences + adaptieve clarify-vraag.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { understand } from "./conversation-engine";
import { processMemoryForTurn, recall } from "./memory-engine";
import { snapshot } from "./context-engine";
import { shouldTakeInitiative } from "./initiative-engine";
import { propose } from "./suggestion-engine";
import { decide } from "./decision-engine";
import { execute } from "./execution-engine";
import {
  isGiftEventConv,
  runGiftEvent,
  type GiftEventInput,
} from "./experiences/gift-event";
import {
  clearExperienceState,
  loadExperienceState,
  saveExperienceState,
} from "./experiences/state-store";
import { mergeGiftData } from "./experiences/continuation";
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

function appendLine(base: string | undefined, extra: string): string {
  const a = (base ?? "").trim();
  const b = extra.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
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

  // 2b. Experience-state laden (lopende gift_event in 15-min window).
  const expState = await loadExperienceState(supabase, userId, now);

  // 3. Conversation (continuation-aware)
  const conv = await withTiming(() =>
    understand(input.text, mem.value.persona, { state: expState }),
  );
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
  let experienceSpokenSummary: string | null = null;
  const primary = conv.value.actions[0];

  // Merge state-data met wat de classifier (of continuation-path) eruit haalde.
  let giftInput: GiftEventInput | null = primary ? isGiftEventConv(primary.payload) : null;
  if (giftInput && expState?.kind === "gift_event") {
    giftInput = mergeGiftData(expState.data, giftInput);
    // Schrijf merged data terug in payload zodat downstream engines die zien.
    primary!.payload.experience_data = giftInput;
  } else if (!giftInput && expState?.kind === "gift_event" && conv.value.isContinuation) {
    giftInput = expState.data;
  }

  if (giftInput) {
    const exp = await withTiming(() =>
      runGiftEvent(supabase, userId, giftInput!, now, {
        persona: mem.value.persona,
        clarifyCount: expState?.clarifyCount ?? 0,
        isContinuation: conv.value.isContinuation,
        turnId: turn_id,
      }),
    );
    timings.experience = exp.ms;

    if (exp.value.mode === "clarify") {
      // Persist + verlaat experience-tak met alleen tekst (geen voorstellen).
      await saveExperienceState(
        supabase,
        userId,
        {
          kind: "gift_event",
          data: giftInput,
          askedField: exp.value.askedField,
          clarifyCount: (expState?.clarifyCount ?? 0) + 1,
        },
        now,
      );

      // Strip suggested_actions zodat Suggestion Engine niets voorstelt.
      if (primary) {
        primary.payload.experience_mode = "clarify";
        delete primary.payload.suggested_actions;
        // Geef de classifier-reply een vervangende waarde voor Execution.
        primary.payload.reply = exp.value.question;
      }
      conv.value.assistantReply = exp.value.question;
      experienceSpokenSummary = exp.value.spokenSummary;

      trace.experience = {
        kind: "gift_event",
        mode: "clarify",
        asked_field: exp.value.askedField,
        clarify_count: (expState?.clarifyCount ?? 0) + 1,
        had_state: !!expState,
        state_age_ms: expState?.ageMs ?? null,
        is_continuation: conv.value.isContinuation,
        had_existing_event: false,
        had_existing_reminder: false,
        ideas_count: 0,
        ms: exp.ms,
      };
    } else {
      experienceCard = exp.value.card;
      experienceSpokenSummary = exp.value.spokenSummary || null;
      if (exp.value.reminderAction && primary) {
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
      // Klaar met deze experience — state opruimen.
      if (expState) {
        void clearExperienceState(supabase, userId);
      }

      trace.experience = {
        kind: "gift_event",
        mode: "results",
        asked_field: null,
        clarify_count: expState?.clarifyCount ?? 0,
        had_state: !!expState,
        state_age_ms: expState?.ageMs ?? null,
        is_continuation: conv.value.isContinuation,
        had_existing_event: !!exp.value.existingAppointmentId,
        had_existing_reminder: !!exp.value.existingReminderId,
        ideas_count: exp.value.ideas.length,
        ms: exp.ms,
      };
    }
  }

  // 4. Initiative
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

  // 6. Decision
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

  if (experienceCard) {
    result.experience_card = experienceCard;
  }
  if (experienceSpokenSummary) {
    result.spoken_summary = experienceSpokenSummary;
  }

  // Memory write-back (Sprint 6) — bevestiging afhandelen of nieuwe
  // pending kandidaat aanmaken. Hangt natuurlijke vraag aan reply.
  const memOutcome = await withTiming(() =>
    processMemoryForTurn(supabase, userId, input.text, now, { turnId: turn_id }),
  );
  timings.memory_writeback = memOutcome.ms;
  const m = memOutcome.value;

  if (m.confirmationAck) {
    result.assistant_reply = appendLine(result.assistant_reply, m.confirmationAck);
    if (result.status === "completed" && !result.query_result) {
      result.confirmation = result.assistant_reply ?? result.confirmation;
    }
  }
  if (m.pendingQuestion) {
    result.assistant_reply = appendLine(result.assistant_reply, m.pendingQuestion);
    if (result.status === "completed" && !result.query_result) {
      result.confirmation = result.assistant_reply ?? result.confirmation;
    }
  }

  trace.memory_writeback = {
    handled_confirmation: m.handledConfirmation,
    created_pending: m.createdPending,
    category: m.category,
    future_value: m.futureValue,
    active_records_count: mem.value.records.length,
    ms: memOutcome.ms,
  };

  trace.total_ms = Math.round(performance.now() - turnStart);
  trace.slowest_engine = pickSlowest(timings);
  result.engine_trace = trace;

  const chosenActions: import("@/lib/voice/types").VoiceAction[] =
    dec.value.proposals
      // Geen DB-acties bij clarify-pad — alleen tekst + state-update.
      .filter((p) => p.skill !== "assistant_chat")
      .map((p) => ({
        intent: p.skill,
        payload: p.payload,
        confidence: 0.8,
      }));

  return { result, trace, chosenActions };
}

export type { AssistantTurn } from "./types";
