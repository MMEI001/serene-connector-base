// Server-only helpers for ICS calendar sync. Safe to import from server routes
// and other *.server modules. Never import from client code or route component
// chains.
import type { SupabaseClient } from "@supabase/supabase-js";

type ParsedEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
};

async function fetchAndParse(url: string): Promise<ParsedEvent[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error("Geen geldige ICS-feed");
  }
  const ICAL = (await import("ical.js")).default;
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal as never);
  const vevents = comp.getAllSubcomponents("vevent");

  const out: ParsedEvent[] = [];
  const seen = new Set<string>();
  for (const ve of vevents) {
    try {
      const ev = new ICAL.Event(ve);
      const uid = ev.uid ?? ve.getFirstPropertyValue("uid")?.toString();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const startProp = ev.startDate;
      if (!startProp) continue;
      out.push({
        uid,
        summary: (ev.summary ?? "").toString().slice(0, 500),
        description: ev.description ? ev.description.toString().slice(0, 2000) : null,
        location: ev.location ? ev.location.toString().slice(0, 500) : null,
        start_time: startProp.toJSDate().toISOString(),
        end_time: ev.endDate ? ev.endDate.toJSDate().toISOString() : null,
        is_all_day: Boolean(startProp.isDate),
      });
    } catch (err) {
      console.warn("[ics] skip event", err);
    }
  }
  return out;
}

export async function syncCalendarRow(
  supabaseAdmin: SupabaseClient,
  cal: { id: string; url: string },
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const events = await fetchAndParse(cal.url);
    if (events.length > 0) {
      const rows = events.map((e) => ({ calendar_id: cal.id, ...e }));
      const { error: upErr } = await supabaseAdmin
        .from("ics_events")
        .upsert(rows, { onConflict: "calendar_id,uid" });
      if (upErr) throw new Error(upErr.message);

      const keepUids = events.map((e) => e.uid);
      const list = keepUids.map((u) => `"${u.replace(/"/g, '""')}"`).join(",");
      await supabaseAdmin
        .from("ics_events")
        .delete()
        .eq("calendar_id", cal.id)
        .not("uid", "in", `(${list})`);
    } else {
      await supabaseAdmin.from("ics_events").delete().eq("calendar_id", cal.id);
    }

    await supabaseAdmin
      .from("ics_calendars")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
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

export async function fetchAndValidateIcs(url: string) {
  return fetchAndParse(url);
}
