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

export const listIcsCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ics_calendars")
      .select("id, name, url, color, last_synced_at, last_error, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

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

    const { fetchAndValidateIcs } = await import("@/lib/ics-calendar.server");
    let parsed;
    try {
      parsed = await fetchAndValidateIcs(normalizedUrl);
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

    const [{ supabaseAdmin }, { syncCalendarRow }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/ics-calendar.server"),
    ]);
    return syncCalendarRow(supabaseAdmin, cal);
  });

export const syncAllIcsCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: cals, error } = await context.supabase
      .from("ics_calendars")
      .select("id, url");
    if (error) throw new Error(error.message);

    const [{ supabaseAdmin }, { syncCalendarRow }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/ics-calendar.server"),
    ]);
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
