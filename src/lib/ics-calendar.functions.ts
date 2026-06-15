import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(
    (v) => /^(webcal|https|http):\/\//i.test(v),
    "URL moet beginnen met webcal://, https:// of http://",
  );

const nameSchema = z.string().trim().min(1).max(100);

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^webcal:\/\//i.test(trimmed)) {
    return "https://" + trimmed.slice("webcal://".length);
  }
  return trimmed;
}

type ParsedEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start_time: string; // ISO
  end_time: string | null;
  is_all_day: boolean;
};

async function fetchAndParse(url: string): Promise<ParsedEvent[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Kon feed niet ophalen (HTTP ${res.status})`);
  }
  const text = await res.text();
  if (!text || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error("Antwoord lijkt geen geldige ICS-feed");
  }

  // Dynamic import — ical.js is server-safe but keep load out of client bundle scope
  const ICAL = (await import("ical.js")).default;
  let jcal: unknown;
  try {
    jcal = ICAL.parse(text);
  } catch (e) {
    throw new Error(
      `Kon ICS niet parsen: ${e instanceof Error ? e.message : "onbekende fout"}`,
    );
  }
  const comp = new ICAL.Component(jcal as never);
  const vevents = comp.getAllSubcomponents("vevent");

  const out: ParsedEvent[] = [];
  const seen = new Set<string>();
  for (const ve of vevents) {
    try {
      const ev = new ICAL.Event(ve);
      const uid = ev.uid ?? ve.getFirstPropertyValue("uid")?.toString();
      if (!uid) continue;
      // Skip duplicate UIDs within the same feed (recurrence overrides)
      if (seen.has(uid)) continue;
      seen.add(uid);

      const startProp = ev.startDate;
      if (!startProp) continue;
      const isAllDay = Boolean(startProp.isDate);
      const startJs = startProp.toJSDate();
      const endJs = ev.endDate ? ev.endDate.toJSDate() : null;

      out.push({
        uid,
        summary: (ev.summary ?? "").toString().slice(0, 500),
        description: ev.description ? ev.description.toString().slice(0, 2000) : null,
        location: ev.location ? ev.location.toString().slice(0, 500) : null,
        start_time: startJs.toISOString(),
        end_time: endJs ? endJs.toISOString() : null,
        is_all_day: isAllDay,
      });
    } catch (err) {
      console.warn("[ics] skip event", err);
    }
  }
  return out;
}

async function syncCalendarRow(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  cal: { id: string; url: string },
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const events = await fetchAndParse(cal.url);
    const nowIso = new Date().toISOString();

    if (events.length > 0) {
      const rows = events.map((e) => ({ calendar_id: cal.id, ...e }));
      const { error: upErr } = await supabaseAdmin
        .from("ics_events")
        .upsert(rows, { onConflict: "calendar_id,uid" });
      if (upErr) throw new Error(upErr.message);
    }

    // Delete events no longer in the feed
    const keepUids = events.map((e) => e.uid);
    if (keepUids.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("ics_events")
        .delete()
        .eq("calendar_id", cal.id)
        .not("uid", "in", `(${keepUids.map((u) => `"${u.replace(/"/g, '""')}"`).join(",")})`);
      if (delErr) console.warn("[ics] delete stale failed", delErr);
    } else {
      await supabaseAdmin.from("ics_events").delete().eq("calendar_id", cal.id);
    }

    await supabaseAdmin
      .from("ics_calendars")
      .update({ last_synced_at: nowIso, last_error: null })
      .eq("id", cal.id);

    return { ok: true, count: events.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("ics_calendars")
      .update({ last_error: msg })
      .eq("id", cal.id);
    return { ok: false, error: msg };
  }
}

// ---- Public server functions ----

export const listIcsCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ics_calendars")
      .select("id, name, url, color, last_synced_at, last_error, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Get event counts per calendar
    const ids = (data ?? []).map((c) => c.id);
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: ev } = await context.supabase
        .from("ics_events")
        .select("calendar_id")
        .in("calendar_id", ids);
      for (const row of ev ?? []) {
        counts[row.calendar_id] = (counts[row.calendar_id] ?? 0) + 1;
      }
    }

    return (data ?? []).map((c) => ({ ...c, event_count: counts[c.id] ?? 0 }));
  });

export const addIcsCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: nameSchema, url: urlSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const normalizedUrl = normalizeUrl(data.url);

    // Validate by fetching/parsing before insert
    let parsed: ParsedEvent[];
    try {
      parsed = await fetchAndParse(normalizedUrl);
    } catch (e) {
      throw new Error(
        `Feed ongeldig: ${e instanceof Error ? e.message : "onbekende fout"}`,
      );
    }

    const { data: inserted, error } = await context.supabase
      .from("ics_calendars")
      .insert({
        user_id: context.userId,
        name: data.name,
        url: normalizedUrl,
      })
      .select("id, name, url, color, last_synced_at, last_error, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Initial sync via admin client (we already validated; reuse parsed events)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    if (parsed.length > 0) {
      const rows = parsed.map((e) => ({ calendar_id: inserted.id, ...e }));
      await supabaseAdmin
        .from("ics_events")
        .upsert(rows, { onConflict: "calendar_id,uid" });
    }
    await supabaseAdmin
      .from("ics_calendars")
      .update({ last_synced_at: nowIso, last_error: null })
      .eq("id", inserted.id);

    return { ...inserted, last_synced_at: nowIso, event_count: parsed.length };
  });

export const deleteIcsCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ics_calendars")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncIcsCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: cal, error } = await context.supabase
      .from("ics_calendars")
      .select("id, url")
      .eq("id", data.id)
      .single();
    if (error || !cal) throw new Error("Agenda niet gevonden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await syncCalendarRow(supabaseAdmin, cal);
    return result;
  });

export const syncAllIcsCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: cals, error } = await context.supabase
      .from("ics_calendars")
      .select("id, url");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: Record<string, { ok: boolean; count?: number; error?: string }> = {};
    await Promise.all(
      (cals ?? []).map(async (c) => {
        const r = await syncCalendarRow(supabaseAdmin, c);
        results[c.id] = r.ok
          ? { ok: true, count: r.count }
          : { ok: false, error: r.error };
      }),
    );
    return results;
  });

export const listIcsEventsInRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: cals, error: calErr } = await context.supabase
      .from("ics_calendars")
      .select("id, name, color");
    if (calErr) throw new Error(calErr.message);

    const calMap = new Map<string, { name: string; color: string | null }>();
    for (const c of cals ?? []) calMap.set(c.id, { name: c.name, color: c.color });
    const ids = (cals ?? []).map((c) => c.id);
    if (ids.length === 0) return [];

    const { data: events, error: evErr } = await context.supabase
      .from("ics_events")
      .select("id, calendar_id, summary, description, location, start_time, end_time, is_all_day")
      .in("calendar_id", ids)
      .gte("start_time", data.from)
      .lte("start_time", data.to)
      .order("start_time", { ascending: true });
    if (evErr) throw new Error(evErr.message);

    return (events ?? []).map((e) => ({
      ...e,
      calendar_name: calMap.get(e.calendar_id)?.name ?? "Agenda",
      calendar_color: calMap.get(e.calendar_id)?.color ?? null,
    }));
  });

// Internal helper for the cron route — not for client use
export async function syncAllCalendarsAdmin(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cals, error } = await supabaseAdmin
    .from("ics_calendars")
    .select("id, url");
  if (error) throw new Error(error.message);

  let ok = 0;
  let failed = 0;
  await Promise.all(
    (cals ?? []).map(async (c) => {
      const r = await syncCalendarRow(supabaseAdmin, c);
      if (r.ok) ok += 1;
      else failed += 1;
    }),
  );
  return { total: cals?.length ?? 0, ok, failed };
}
