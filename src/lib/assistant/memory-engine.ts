/**
 * Memory Engine — voorkeuren, gewoontes en context die de gebruiker later
 * beter helpen.
 *
 * Sprint 6 (Persistent Memory v1):
 *  - recall(): persona + actieve memory-hits uit public.assistant_memory.
 *  - handleConfirmationTurn(): vangt ja/nee op een lopende vraag.
 *  - extractAndStore(): keyword-classifier → pending_confirmation rij +
 *    natuurlijke bevestigingsvraag voor de assistent.
 *
 * Privacy-principes:
 *  - Niets opslaan zonder expliciete bevestiging.
 *  - Geen ruwe transcripts in trace — alleen tellingen, categorieën, scores.
 *  - Maximaal één kandidaat per turn.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserPersona } from "@/lib/voice/load-persona";
import type { UserPersona } from "@/lib/voice/persona";
import type { MemoryHit } from "./types";
import {
  detectMemoryConfirmation,
  extractMemoryCandidates,
} from "./memory/classifier";
import {
  findDuplicate,
  findPendingForConfirmation,
  insertPendingCandidate,
  loadActiveMemory,
  setMemoryStatus,
} from "./memory/store";
import type { MemoryCandidate, MemoryRecord } from "./memory/types";

export async function recall(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  persona: UserPersona;
  hits: MemoryHit[];
  records: MemoryRecord[];
}> {
  const [persona, records] = await Promise.all([
    loadUserPersona(supabase, userId),
    loadActiveMemory(supabase, userId, 30).catch(() => []),
  ]);

  const hits: MemoryHit[] = records.map((r) => ({
    key: `${r.category}:${r.subject ?? "_"}`,
    source: "dynamic" as const,
    confidence: r.confidence,
  }));

  return { persona, hits, records };
}

export type MemoryTurnOutcome = {
  /** Bevestigingsvraag die aan assistent_reply moet hangen (null = geen). */
  pendingQuestion: string | null;
  /** Korte bevestiging na ja/nee ("Top, ik onthoud het."). */
  confirmationAck: string | null;
  /** True als er een ja/nee is afgehandeld voor een eerdere pending memory. */
  handledConfirmation: boolean;
  /** True als er nu een nieuwe pending memory is aangemaakt. */
  createdPending: boolean;
  /** Categorie van wat er deze turn gebeurde — voor trace. */
  category: MemoryCandidate["category"] | null;
  /** Future Value Score van wat er deze turn gebeurde — voor trace. */
  futureValue: number | null;
};

/**
 * Centrale hook voor de Memory Engine binnen één assistent-turn.
 *
 * Volgorde:
 *  1. Als er een pending bevestiging openstaat én de gebruiker antwoordt
 *     duidelijk ja/nee → status flippen.
 *  2. Anders: probeer een kandidaat te extraheren. Skip duplicaten.
 *     Maak pending_confirmation rij en geef de natuurlijke vraag terug.
 */
export async function processMemoryForTurn(
  supabase: SupabaseClient,
  userId: string,
  text: string,
  now: Date,
  meta: { turnId?: string } = {},
): Promise<MemoryTurnOutcome> {
  const outcome: MemoryTurnOutcome = {
    pendingQuestion: null,
    confirmationAck: null,
    handledConfirmation: false,
    createdPending: false,
    category: null,
    futureValue: null,
  };

  // 1. Pending confirmation?
  const reply = detectMemoryConfirmation(text);
  if (reply) {
    const pending = await findPendingForConfirmation(supabase, userId, now);
    if (pending) {
      const nextStatus = reply === "yes" ? "active" : "rejected";
      await setMemoryStatus(supabase, pending.id, nextStatus);
      outcome.handledConfirmation = true;
      outcome.category = pending.category;
      outcome.futureValue = pending.futureValue;
      outcome.confirmationAck =
        reply === "yes"
          ? "Top, ik onthoud het."
          : "Helder, ik bewaar het niet.";
      return outcome;
    }
  }

  // 2. Nieuwe kandidaat?
  const candidates = extractMemoryCandidates(text);
  const candidate = candidates[0];
  if (!candidate) return outcome;

  // Drempels: future value × confidence moet zinvol zijn.
  if (candidate.futureValue * candidate.confidence < 0.35) return outcome;

  // Duplicate? Sla niets nieuws op en stel ook geen vraag.
  const dup = await findDuplicate(supabase, userId, candidate);
  if (dup) {
    outcome.category = candidate.category;
    outcome.futureValue = candidate.futureValue;
    return outcome;
  }

  const id = await insertPendingCandidate(supabase, userId, candidate, {
    turnId: meta.turnId,
  });
  if (!id) return outcome;

  outcome.createdPending = true;
  outcome.category = candidate.category;
  outcome.futureValue = candidate.futureValue;
  outcome.pendingQuestion = candidate.confirmQuestion;
  return outcome;
}
