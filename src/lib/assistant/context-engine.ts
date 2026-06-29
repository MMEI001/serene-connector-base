/**
 * Context Engine — combineert tijd, agenda, reminders en eerdere gesprekken
 * tot een lichte snapshot waar Suggestion + Decision op kunnen leunen.
 *
 * Sprint 1: minimale snapshot (agenda-count + eerstvolgende event vandaag).
 * Zware query-logica blijft in de bestaande query-handler tot een latere
 * sprint hem volledig hierheen verhuist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextSnapshot } from "./types";

export async function snapshot(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<ContextSnapshot> {
  const today = toAmsDate(now);
  const tomorrow = toAmsDate(new Date(+now + 86400000));

  const { data, error } = await supabase
    .from("appointments")
    .select("title,date,start_time")
    .eq("user_id", userId)
    .gte("date", today)
    .lt("date", tomorrow)
    .order("start_time", { ascending: true, nullsFirst: true })
    .limit(5);

  if (error) {
    console.warn("[context] snapshot error:", error.message);
    return { todayCount: 0, nextEvent: null };
  }

  const rows = data ?? [];
  const next = rows[0];
  return {
    todayCount: rows.length,
    nextEvent: next
      ? {
          title: next.title as string,
          whenIso: `${next.date}T${(next.start_time as string | null) ?? "12:00"}`,
        }
      : null,
  };
}

function toAmsDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
