/**
 * Memory Store — alle DB-toegang tot public.assistant_memory.
 *
 * RLS scoped op auth.uid(); de hier gebruikte SupabaseClient is altijd
 * de geauthenticeerde server-fn client uit requireSupabaseAuth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryCandidate, MemoryRecord, MemoryStatus } from "./types";

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minuten voor ja/nee-bevestiging

function rowToRecord(r: {
  id: string;
  subject: string | null;
  category: MemoryRecord["category"];
  value: string;
  confidence: number;
  future_value_score: number;
  status: MemoryStatus;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
}): MemoryRecord {
  return {
    id: r.id,
    subject: r.subject,
    category: r.category,
    value: r.value,
    confidence: Number(r.confidence),
    futureValue: Number(r.future_value_score),
    status: r.status,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
    createdAt: r.created_at,
  };
}

export async function loadActiveMemory(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<MemoryRecord[]> {
  const { data, error } = await supabase
    .from("assistant_memory")
    .select(
      "id,subject,category,value,confidence,future_value_score,status,last_used_at,use_count,created_at",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("future_value_score", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(rowToRecord);
}

export async function findPendingForConfirmation(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<MemoryRecord | null> {
  const cutoff = new Date(now.getTime() - PENDING_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("assistant_memory")
    .select(
      "id,subject,category,value,confidence,future_value_score,status,last_used_at,use_count,created_at",
    )
    .eq("user_id", userId)
    .eq("status", "pending_confirmation")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return rowToRecord(data);
}

export async function findDuplicate(
  supabase: SupabaseClient,
  userId: string,
  candidate: MemoryCandidate,
): Promise<MemoryRecord | null> {
  let query = supabase
    .from("assistant_memory")
    .select(
      "id,subject,category,value,confidence,future_value_score,status,last_used_at,use_count,created_at",
    )
    .eq("user_id", userId)
    .eq("category", candidate.category)
    .eq("value", candidate.value)
    .in("status", ["pending_confirmation", "active"])
    .limit(1);
  if (candidate.subject === null) {
    query = query.is("subject", null);
  } else {
    query = query.eq("subject", candidate.subject);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return rowToRecord(data);
}

export async function insertPendingCandidate(
  supabase: SupabaseClient,
  userId: string,
  candidate: MemoryCandidate,
  meta: { turnId?: string; sourceActionId?: string | null } = {},
): Promise<string | null> {
  const { data, error } = await supabase
    .from("assistant_memory")
    .insert({
      user_id: userId,
      subject: candidate.subject,
      category: candidate.category,
      value: candidate.value,
      confidence: candidate.confidence,
      future_value_score: candidate.futureValue,
      status: "pending_confirmation" as MemoryStatus,
      source_action_id: meta.sourceActionId ?? null,
      source_turn_id: meta.turnId ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export async function setMemoryStatus(
  supabase: SupabaseClient,
  id: string,
  status: MemoryStatus,
): Promise<void> {
  await supabase.from("assistant_memory").update({ status }).eq("id", id);
}

export async function touchMemoryUsed(
  supabase: SupabaseClient,
  ids: string[],
  now: Date,
): Promise<void> {
  if (ids.length === 0) return;
  // Geen RPC nodig — Supabase laat geen atomic increment toe via REST.
  // We lezen + schrijven los; dit pad loopt buiten de hot loop.
  const { data } = await supabase
    .from("assistant_memory")
    .select("id,use_count")
    .in("id", ids);
  if (!data) return;
  await Promise.all(
    data.map((row) =>
      supabase
        .from("assistant_memory")
        .update({
          use_count: (row.use_count ?? 0) + 1,
          last_used_at: now.toISOString(),
        })
        .eq("id", row.id),
    ),
  );
}
