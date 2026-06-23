import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, QueryItem } from "../types";
import type { UserPersona } from "../persona";

type Ctx = { supabase: SupabaseClient; userId: string };

type Scope = "today" | "tomorrow" | "this_week" | "next_week" | "specific_date";

function rangeFor(scope: Scope, dateStr?: string): { from: Date; to: Date; label: string } {
  const tz = "Europe/Amsterdam";
  const now = new Date();
  const today = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now) + "T00:00:00+02:00",
  );
  const day = 86400000;
  const startOfWeek = (d: Date) => {
    const out = new Date(d);
    const dow = (out.getDay() + 6) % 7; // maandag = 0
    out.setDate(out.getDate() - dow);
    return out;
  };

  switch (scope) {
    case "tomorrow":
      return { from: new Date(+today + day), to: new Date(+today + 2 * day), label: "Morgen" };
    case "this_week": {
      const from = startOfWeek(today);
      return { from, to: new Date(+from + 7 * day), label: "Deze week" };
    }
    case "next_week": {
      const from = new Date(+startOfWeek(today) + 7 * day);
      return { from, to: new Date(+from + 7 * day), label: "Volgende week" };
    }
    case "specific_date":
      if (dateStr) {
        const f = new Date(`${dateStr}T00:00:00+02:00`);
        return { from: f, to: new Date(+f + day), label: formatDayLabel(f) };
      }
      return { from: today, to: new Date(+today + day), label: "Vandaag" };
    case "today":
    default:
      return { from: today, to: new Date(+today + day), label: "Vandaag" };
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
): Promise<ActionResult> {
  const scope = (typeof payload.scope === "string" ? payload.scope : "today") as Scope;
  const dateStr = typeof payload.date === "string" ? payload.date : undefined;
  const { from, to, label } = rangeFor(scope, dateStr);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);

  const [appts, rems, ics] = await Promise.all([
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
      .from("ics_events")
      .select("id,summary,start_time,calendar_id,ics_calendars(name)")
      .gte("start_time", fromIso)
      .lt("start_time", toIso)
      .order("start_time", { ascending: true }),
  ]);

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
    const cal = (e as { ics_calendars?: { name?: string } | null }).ics_calendars;
    items.push({
      id: e.id as string,
      kind: "ics_event",
      title: e.summary as string,
      when: formatIcsWhen(e.start_time as string),
      source: "ics",
      source_label: cal?.name ?? "Agenda",
    });
  }

  items.sort((a, b) => a.when.localeCompare(b.when));

  const count = items.length;
  const intro =
    count === 0
      ? `${label} staat er niets in de agenda.`
      : count === 1
        ? `${label} staat er één ding:`
        : `${label} staan er ${count} dingen:`;

  return {
    intent: "query",
    status: "completed",
    confirmation: intro,
    query_result: { intro, items },
  };
}
