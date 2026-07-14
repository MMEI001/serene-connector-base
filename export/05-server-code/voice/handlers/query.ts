import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, QueryItem } from "../types";
import type { UserPersona } from "../persona";

type Ctx = { supabase: SupabaseClient; userId: string };

type Scope = "today" | "tomorrow" | "this_week" | "next_week" | "specific_date";

function amsterdamDateTimeToIso(dateIso: string, time = "00:00:00"): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0));
  const tz = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "shortOffset",
  }).formatToParts(utcGuess).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = tz.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  const offsetMinutes = match
    ? Number(match[1]) * 60 + (Number(match[2] ?? 0) * Math.sign(Number(match[1])))
    : 60;
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0) - offsetMinutes * 60_000).toISOString();
}

function todayIsoAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function rangeFor(scope: Scope, dateStr?: string): { from: Date; to: Date; label: string } {
  const todayIso = todayIsoAmsterdam();
  const today = new Date(amsterdamDateTimeToIso(todayIso));
  const dayMs = 86400000;
  const startOfWeek = (d: Date) => {
    const out = new Date(d);
    const dow = (out.getDay() + 6) % 7; // maandag = 0
    out.setDate(out.getDate() - dow);
    return out;
  };

  switch (scope) {
    case "tomorrow":
      return { from: new Date(amsterdamDateTimeToIso(addDaysIso(todayIso, 1))), to: new Date(amsterdamDateTimeToIso(addDaysIso(todayIso, 2))), label: "Morgen" };
    case "this_week": {
      const from = startOfWeek(today);
      return { from, to: new Date(+from + 7 * dayMs), label: "Deze week" };
    }
    case "next_week": {
      const from = new Date(+startOfWeek(today) + 7 * dayMs);
      return { from, to: new Date(+from + 7 * dayMs), label: "Volgende week" };
    }
    case "specific_date":
      if (dateStr) {
        const f = new Date(amsterdamDateTimeToIso(dateStr));
        const t = new Date(amsterdamDateTimeToIso(addDaysIso(dateStr, 1)));
        return { from: f, to: t, label: formatDayLabel(f) };
      }
      return { from: today, to: new Date(amsterdamDateTimeToIso(addDaysIso(todayIso, 1))), label: "Vandaag" };
    case "today":
    default:
      return { from: today, to: new Date(amsterdamDateTimeToIso(addDaysIso(todayIso, 1))), label: "Vandaag" };
  }
}

function formatDayLabel(d: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
  }).format(d);
}

function formatWhen(date: string, time?: string | null): string {
  const d = new Date(`${date}T${time ?? "12:00"}:00+02:00`);
  const day = new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Amsterdam",
  }).format(d);
  if (!time) return day;
  return `${day} ${time.slice(0, 5)}`;
}

function formatIcsWhen(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(d);
}

export async function handleQuery(
  ctx: Ctx,
  payload: Record<string, unknown>,
  persona?: UserPersona,
): Promise<ActionResult> {
  const scope = (typeof payload.scope === "string" ? payload.scope : "today") as Scope;
  const dateStr = typeof payload.date === "string" ? payload.date : undefined;
  const { from, to, label } = rangeFor(scope, dateStr);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const fromDate = scope === "specific_date" && dateStr ? dateStr : amsterdamDateForInstant(from);
  const toDate = scope === "specific_date" && dateStr ? addDaysIso(dateStr, 1) : amsterdamDateForInstant(to);

  const [appts, rems, calendars] = await Promise.all([
    ctx.supabase
      .from("appointments")
      .select("id,title,date,start_time")
      .eq("user_id", ctx.userId)
      .gte("date", fromDate)
      .lt("date", toDate)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true }),
    ctx.supabase
      .from("reminders")
      .select("id,title,remind_at,status")
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .gte("remind_at", fromIso)
      .lt("remind_at", toIso)
      .order("remind_at", { ascending: true }),
    ctx.supabase
      .from("ics_calendars")
      .select("id,name")
      .eq("user_id", ctx.userId),
  ]);

  const calMap = new Map((calendars.data ?? []).map((c) => [c.id as string, c.name as string]));
  const calIds = Array.from(calMap.keys());
  const ics = calIds.length > 0
    ? await ctx.supabase
        .from("ics_events")
        .select("id,summary,start_time,calendar_id")
        .in("calendar_id", calIds)
        .gte("start_time", fromIso)
        .lt("start_time", toIso)
        .order("start_time", { ascending: true })
    : { data: [] };

  const items: QueryItem[] = [];

  for (const a of appts.data ?? []) {
    items.push({
      id: a.id as string,
      kind: "appointment",
      title: a.title as string,
      when: formatWhen(a.date as string, a.start_time as string | null),
      source: "manual",
      source_label: "Eigen",
    });
  }
  for (const r of rems.data ?? []) {
    items.push({
      id: r.id as string,
      kind: "reminder",
      title: r.title as string,
      when: formatIcsWhen(r.remind_at as string),
      source: "reminder",
      source_label: "Reminder",
    });
  }
  for (const e of ics.data ?? []) {
    items.push({
      id: e.id as string,
      kind: "ics_event",
      title: e.summary as string,
      when: formatIcsWhen(e.start_time as string),
      source: "ics",
      source_label: calMap.get(e.calendar_id as string) ?? "Agenda",
    });
  }

  items.sort((a, b) => a.when.localeCompare(b.when));

  // Persona-cap: respecteer max suggesties (bv. "Eén tegelijk" → 1)
  const cap = persona?.hints.maxSuggestions ?? items.length;
  const visibleItems = items.slice(0, cap);
  const truncated = items.length - visibleItems.length;
  const tone = persona?.hints.tone ?? "soft";

  const count = visibleItems.length;
  const totalCount = items.length;

  let intro: string;
  if (totalCount === 0) {
    intro =
      tone === "brief" || tone === "minimal"
        ? `${label}: niets.`
        : `${label} staat er niets in de agenda.`;
  } else if (tone === "minimal") {
    intro = `${label}: ${totalCount}.`;
  } else if (tone === "brief") {
    intro = `${label}: ${totalCount} ${totalCount === 1 ? "ding" : "dingen"}.`;
  } else if (count === 1 && totalCount === 1) {
    intro = `${label} staat er één ding:`;
  } else {
    intro =
      truncated > 0
        ? `${label} staan er ${totalCount} dingen — ik laat de eerste ${count} zien:`
        : `${label} staan er ${totalCount} dingen:`;
  }

  return {
    intent: "query",
    status: "completed",
    confirmation: intro,
    query_result: { intro, items: visibleItems },
  };
}

function amsterdamDateForInstant(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
