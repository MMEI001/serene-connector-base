/**
 * Daily Briefing — een korte, rustige samenvatting van de dag.
 *
 * Gebruikt de Context Engine v2 (snapshot) om afspraken, reminders,
 * vrije tijdsblokken en dagdeel op te halen, en stelt daarmee een
 * warme 2-3 zins begroeting samen. Wordt maximaal één keer per dag
 * automatisch afgespeeld op de homepage (zie client-side dedupe).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { snapshot } from "@/lib/assistant/context-engine";
import type { ContextSnapshot } from "@/lib/assistant/types";

export type DailyBriefing = {
  text: string;
  hasContent: boolean;
  nextEvent: ContextSnapshot["nextEvent"];
  topReminder: { id: string; title: string; remind_at: string | null } | null;
  freeBlock: { start: string; end: string } | null;
  timeOfDay: ContextSnapshot["timeOfDay"];
};

function greeting(timeOfDay: ContextSnapshot["timeOfDay"]): string {
  switch (timeOfDay) {
    case "morning":
      return "Goedemorgen.";
    case "afternoon":
      return "Fijn dat je er weer bent.";
    case "evening":
      return "Goedenavond.";
    default:
      return "Daar ben je weer.";
  }
}

function fmtWhen(ev: NonNullable<ContextSnapshot["nextEvent"]>, today: string): string {
  const timeLabel = ev.startTime || "";
  const isToday = ev.date === today;
  if (isToday) return timeLabel ? `om ${timeLabel}` : "vandaag";
  // niet vandaag: geef alleen "morgen" of datum
  const [y, m, d] = ev.date.split("-").map(Number);
  const evDate = new Date(Date.UTC(y, m - 1, d));
  const [ty, tm, td] = today.split("-").map(Number);
  const todayDate = new Date(Date.UTC(ty, tm - 1, td));
  const diffDays = Math.round((evDate.getTime() - todayDate.getTime()) / 86400000);
  if (diffDays === 1) return timeLabel ? `morgen om ${timeLabel}` : "morgen";
  const fmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  return `op ${fmt.format(evDate)}${timeLabel ? ` om ${timeLabel}` : ""}`;
}

function todayIsoAmsterdam(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA → YYYY-MM-DD
}

export const getDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DailyBriefing> => {
    const { supabase, userId } = context;
    const now = new Date();
    const today = todayIsoAmsterdam(now);
    const snap = await snapshot(supabase, userId, now);

    // Belangrijkste openstaande reminder: eerst degene met remind_at vandaag,
    // anders willekeurige open reminder.
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;
    const { data: reminderRows } = await supabase
      .from("reminders")
      .select("id,title,remind_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`remind_at.is.null,and(remind_at.gte.${startOfDay},remind_at.lte.${endOfDay})`)
      .order("remind_at", { ascending: true, nullsFirst: false })
      .limit(1);
    const topReminder = reminderRows?.[0] ?? null;

    const freeBlock = snap.freeBlocksToday.find((b) => b.durationMinutes >= 60)
      ?? snap.freeBlocksToday[0]
      ?? null;

    const hello = greeting(snap.timeOfDay);
    const parts: string[] = [hello];

    const appts = snap.todayCount;
    const reminders = snap.openRemindersCount;
    const nextEv = snap.nextEvent;

    if (appts === 0 && reminders === 0) {
      parts.push("Vandaag lijkt rustig. Ik houd het voor je in de gaten.");
      return {
        text: parts.join(" "),
        hasContent: false,
        nextEvent: null,
        topReminder: null,
        freeBlock: freeBlock ? { start: freeBlock.start, end: freeBlock.end } : null,
        timeOfDay: snap.timeOfDay,
      };
    }

    // Zin 1: overzicht
    if (appts > 0 && reminders > 0) {
      parts.push(
        `Vandaag heb je ${appts === 1 ? "één afspraak" : `${appts} afspraken`} en ${reminders === 1 ? "één herinnering" : `${reminders} herinneringen`} openstaan.`,
      );
    } else if (appts > 0) {
      parts.push(
        appts === 1
          ? "Vandaag heb je één afspraak op de planning."
          : `Vandaag staan er ${appts} afspraken op de planning.`,
      );
    } else {
      parts.push(
        reminders === 1
          ? "Er staat één herinnering voor je open."
          : `Er staan ${reminders} herinneringen voor je open.`,
      );
    }

    // Zin 2: eerstvolgende of vrije ruimte — kort houden.
    if (nextEv) {
      parts.push(`De eerstvolgende is ${nextEv.title} ${fmtWhen(nextEv, today)}.`);
    } else if (freeBlock && freeBlock.durationMinutes >= 60) {
      parts.push(`Later vandaag heb je ruimte tussen ${freeBlock.start} en ${freeBlock.end}.`);
    }

    return {
      text: parts.join(" "),
      hasContent: true,
      nextEvent: nextEv,
      topReminder,
      freeBlock: freeBlock ? { start: freeBlock.start, end: freeBlock.end } : null,
      timeOfDay: snap.timeOfDay,
    };
  });
