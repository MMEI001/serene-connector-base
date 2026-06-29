/**
 * Context Engine — berekent actuele tijd, kalender, beschikbare blokken en
 * actieve herinneringen/memories tot één compacte, gestructureerde snapshot.
 *
 * Sprint 7 (Context Engine v2):
 * Alle Experiences (Bloemen, Kapper, Kinderfeestje, ...) krijgen exact
 * dezelfde rijke context aangereikt. Privacy-veilig in EngineTrace:
 * alleen categorieën en tellingen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextSnapshot, FreeTimeBlock, NextAppointmentCompact } from "./types";
import type { MemoryRecord } from "./memory/types";

export async function snapshot(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
  activeMemories?: MemoryRecord[],
): Promise<ContextSnapshot> {
  const amsParts = getAmsterdamTimeParts(now);
  const today = amsParts.dateIso;
  const tomorrow = getNextDaysIso(amsParts.dateIso, 1);
  const nextWeek = getNextDaysIso(amsParts.dateIso, 7);

  // Parallelle database reads voor kalender & open reminders
  const [apptsTodayRes, apptsNextRes, remindersRes] = await Promise.all([
    // Afspraken vandaag
    supabase
      .from("appointments")
      .select("title,date,start_time,end_time")
      .eq("user_id", userId)
      .eq("date", today)
      .order("start_time", { ascending: true, nullsFirst: true }),

    // Eerstvolgende afspraak vanaf nu (vandaag of later)
    supabase
      .from("appointments")
      .select("title,date,start_time")
      .eq("user_id", userId)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true })
      .limit(5),

    // Openstaande reminders
    supabase
      .from("reminders")
      .select("id")
      .eq("user_id", userId)
      .eq("is_completed", false)
      .limit(50),
  ]);

  const apptsToday = apptsTodayRes.data ?? [];
  const allUpcoming = apptsNextRes.data ?? [];
  const openRemindersCount = remindersRes.data?.length ?? 0;

  // 1. Eerstvolgende afspraak na actueel tijdstip
  const nextEvent = findNextEvent(allUpcoming, amsParts.dateIso, amsParts.timeIso);

  // 2. Vrije tijdsblokken vandaag (tussen 08:00 en 22:00)
  const freeBlocksToday = calculateFreeBlocks(apptsToday, amsParts.timeIso);

  // 3. Relevante memories tellingen per categorie
  const memoriesCountByCategory: Record<string, number> = {};
  for (const m of activeMemories ?? []) {
    if (m.status === "active") {
      memoriesCountByCategory[m.category] = (memoriesCountByCategory[m.category] ?? 0) + 1;
    }
  }

  // 4. Aankomende verjaardagen in de komende 7 dagen (via activeMemories of verjaardags-afspraken)
  let upcomingBirthdaysCount = 0;
  for (const row of allUpcoming) {
    if (row.date >= today && row.date <= nextWeek && row.title?.toLowerCase().includes("verjaard")) {
      upcomingBirthdaysCount++;
    }
  }
  for (const m of activeMemories ?? []) {
    if (m.status === "active" && (m.category === "family_member" || m.category === "child_interest" || m.category === "other")) {
      if (m.value.toLowerCase().includes("verjaardag") || m.value.toLowerCase().includes("geboren")) {
        // Tellen als bekende verjaardags-memory
        upcomingBirthdaysCount++;
      }
    }
  }

  // 5. Categorieën en tellingen voor trace
  const categories: ContextSnapshot["categories"] = [];
  if (apptsToday.length > 0) categories.push({ category: "appointments_today", count: apptsToday.length });
  if (nextEvent) categories.push({ category: "next_appointment", count: 1 });
  if (freeBlocksToday.length > 0) categories.push({ category: "free_time_blocks", count: freeBlocksToday.length });
  if (openRemindersCount > 0) categories.push({ category: "open_reminders", count: openRemindersCount });
  if ((activeMemories?.length ?? 0) > 0) categories.push({ category: "relevant_memories", count: activeMemories!.length });
  if (upcomingBirthdaysCount > 0) categories.push({ category: "upcoming_birthdays", count: upcomingBirthdaysCount });
  categories.push({ category: "time_context", count: 1 });

  return {
    todayCount: apptsToday.length,
    nextEvent,
    freeBlocksToday,
    openRemindersCount,
    relevantMemoriesCount: activeMemories?.length ?? 0,
    memoriesCountByCategory,
    upcomingBirthdaysCount,
    travelTimeAvailable: false, // Stub — uit te breiden wanneer we een Maps/Locatie integratie toevoegen
    timeOfDay: amsParts.timeOfDay,
    dayOfWeek: amsParts.dayOfWeek,
    categories,
  };
}

function findNextEvent(
  rows: Array<{ title: string; date: string; start_time?: string | null }>,
  todayIso: string,
  currentTimeIso: string,
): NextAppointmentCompact | null {
  for (const row of rows) {
    const st = row.start_time ?? "00:00:00";
    if (row.date > todayIso || (row.date === todayIso && st >= currentTimeIso)) {
      return {
        title: row.title,
        whenIso: `${row.date}T${st.slice(0, 5)}`,
        date: row.date,
        startTime: st.slice(0, 5),
      };
    }
  }
  return null;
}

function calculateFreeBlocks(
  apptsToday: Array<{ start_time?: string | null; end_time?: string | null }>,
  currentTimeIso: string,
): FreeTimeBlock[] {
  const dayStart = "08:00";
  const dayEnd = "22:00";
  const current = currentTimeIso.slice(0, 5);

  const effectiveStart = current > dayStart ? current : dayStart;
  if (effectiveStart >= dayEnd) return [];

  const busy: Array<{ start: string; end: string }> = [];
  for (const a of apptsToday) {
    if (!a.start_time) continue;
    const st = a.start_time.slice(0, 5);
    const et = a.end_time ? a.end_time.slice(0, 5) : `${String(Math.min(23, Number(st.slice(0, 2)) + 1)).padStart(2, "0")}:${st.slice(3, 5)}`;
    if (et > effectiveStart && st < dayEnd) {
      busy.push({
        start: st < effectiveStart ? effectiveStart : st,
        end: et > dayEnd ? dayEnd : et,
      });
    }
  }

  busy.sort((x, y) => x.start.localeCompare(y.start));

  const merged: Array<{ start: string; end: string }> = [];
  for (const b of busy) {
    if (merged.length === 0) {
      merged.push(b);
    } else {
      const last = merged[merged.length - 1];
      if (b.start <= last.end) {
        if (b.end > last.end) last.end = b.end;
      } else {
        merged.push(b);
      }
    }
  }

  const free: FreeTimeBlock[] = [];
  let cursor = effectiveStart;
  for (const m of merged) {
    if (m.start > cursor) {
      const mins = diffMinutes(cursor, m.start);
      if (mins >= 30) {
        free.push({ start: cursor, end: m.start, durationMinutes: mins });
      }
    }
    cursor = m.end > cursor ? m.end : cursor;
  }
  if (dayEnd > cursor) {
    const mins = diffMinutes(cursor, dayEnd);
    if (mins >= 30) {
      free.push({ start: cursor, end: dayEnd, durationMinutes: mins });
    }
  }

  return free;
}

function diffMinutes(startHm: string, endHm: string): number {
  const [sh, sm] = startHm.split(":").map(Number);
  const [eh, em] = endHm.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function getAmsterdamTimeParts(d: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const hour = Number(map.hour);
  let timeOfDay: ContextSnapshot["timeOfDay"] = "night";
  if (hour >= 6 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 18) timeOfDay = "afternoon";
  else if (hour >= 18 && hour < 23) timeOfDay = "evening";

  const dQwMap: Record<string, ContextSnapshot["dayOfWeek"]> = {
    Monday: "maandag",
    Tuesday: "dinsdag",
    Wednesday: "woensdag",
    Thursday: "donderdag",
    Friday: "vrijdag",
    Saturday: "zaterdag",
    Sunday: "zondag",
  };

  return {
    dateIso: `${map.year}-${map.month}-${map.day}`,
    timeIso: `${map.hour}:${map.minute}:${map.second}`,
    timeOfDay,
    dayOfWeek: dQwMap[map.weekday] ?? "maandag",
  };
}

function getNextDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}