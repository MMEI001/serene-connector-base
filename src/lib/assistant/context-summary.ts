/**
 * Bouw een compacte, mensvriendelijke context-samenvatting die als
 * systeem-context aan het taalmodel wordt gegeven. Blijft kort — het
 * model gebruikt dit ter verrijking, niet als volledige data-dump.
 */

import type { ContextSnapshot } from "./types";
import type { MemoryRecord } from "./memory/types";

export function buildContextSummary(
  snapshot: ContextSnapshot | undefined,
  memories: MemoryRecord[] | undefined,
): string | null {
  if (!snapshot) return null;
  const lines: string[] = [];

  // Tijd
  const dayLabel = capitalize(snapshot.dayOfWeek);
  const partLabel =
    snapshot.timeOfDay === "morning" ? "ochtend"
    : snapshot.timeOfDay === "afternoon" ? "middag"
    : snapshot.timeOfDay === "evening" ? "avond" : "nacht";
  lines.push(`Vandaag is het ${dayLabel} (${partLabel}).`);

  // Afspraken vandaag
  if (snapshot.todayCount > 0) {
    lines.push(`Er staan ${snapshot.todayCount} afspraken vandaag in de agenda.`);
  } else {
    lines.push(`Er staan geen afspraken vandaag in de agenda.`);
  }

  // Eerstvolgende afspraak
  if (snapshot.nextEvent) {
    const ne = snapshot.nextEvent;
    const when = ne.date === todayIsoAmsterdam()
      ? `vandaag ${ne.startTime}`
      : `${ne.date} ${ne.startTime}`;
    lines.push(`Eerstvolgende afspraak: "${ne.title}" op ${when}.`);
  }

  // Vrije blokken
  if (snapshot.freeBlocksToday.length > 0) {
    const totalMin = snapshot.freeBlocksToday.reduce((s, b) => s + b.durationMinutes, 0);
    const hrs = Math.round((totalMin / 60) * 10) / 10;
    lines.push(`Nog ${hrs} uur vrije tijd vandaag (${snapshot.freeBlocksToday.length} blokken).`);
  }

  // Openstaande reminders
  if (snapshot.openRemindersCount > 0) {
    lines.push(`${snapshot.openRemindersCount} openstaande reminders.`);
  }

  // Verjaardagen
  if (snapshot.upcomingBirthdaysCount > 0) {
    lines.push(`${snapshot.upcomingBirthdaysCount} verjaardag(en) op komst.`);
  }

  // Memories (waardevolle feiten die eerder bevestigd zijn)
  const active = (memories ?? []).filter((m) => m.status === "active").slice(0, 8);
  if (active.length > 0) {
    lines.push(`Wat je eerder deelde:`);
    for (const m of active) {
      lines.push(`- ${m.value}`);
    }
  }

  return lines.join("\n");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function todayIsoAmsterdam(): string {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now); // "YYYY-MM-DD"
}
