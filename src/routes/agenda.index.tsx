import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { listIcsEventsInRange } from "@/lib/ics-calendar.functions";

export const Route = createFileRoute("/agenda/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Agenda" }] }),
  component: AgendaPage,
});

type DisplayEvent = {
  id: string;
  source: "appointment" | "ics";
  sourceLabel: string;
  color: string | null;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null;
  appointmentId: string | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function timeSpan(e: DisplayEvent) {
  if (!e.startTime) return null;
  if (!e.endTime) return e.startTime;
  return `${e.startTime} – ${e.endTime}`;
}

function isoDateOf(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palette = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee"];
  return palette[h % palette.length];
}

function groupByDay(items: DisplayEvent[]) {
  const map = new Map<string, DisplayEvent[]>();
  for (const a of items) {
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date)!.push(a);
  }
  // sort each day's events by start time (null first = all-day)
  for (const [, list] of map) {
    list.sort((a, b) => {
      if (a.startTime === b.startTime) return 0;
      if (!a.startTime) return -1;
      if (!b.startTime) return 1;
      return a.startTime.localeCompare(b.startTime);
    });
  }
  return Array.from(map.entries());
}

function ApptList({ groups }: { groups: [string, DisplayEvent[]][] }) {
  return (
    <div className="space-y-8">
      {groups.map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-3 text-sm capitalize text-muted-foreground">
            {formatDay(day)}
          </h2>
          <div className="space-y-3">
            {list.map((a) => {
              const span = timeSpan(a);
              const inner = (
                <Card className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm transition-colors hover:bg-card">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: a.color ?? hashColor(a.sourceLabel) }}
                        aria-hidden
                      />
                      <h3 className="truncate text-base text-foreground">{a.title}</h3>
                    </div>
                    {span && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {span}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {a.sourceLabel}
                    </span>
                  </div>
                </Card>
              );
              return a.href ? (
                <Link key={a.id} to={a.href} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={a.id}>{inner}</div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AgendaPage() {
  const { user } = useAuth();
  const fetchIcs = useServerFn(listIcsEventsInRange);
  const [items, setItems] = useState<DisplayEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Range: 60 days back to 180 days forward
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 60);
      const to = new Date(now);
      to.setDate(to.getDate() + 180);

      const [apptRes, icsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, title, description, date, start_time, end_time")
          .eq("user_id", user.id)
          .eq("status", "scheduled")
          .order("date", { ascending: true }),
        fetchIcs({
          data: { from: from.toISOString(), to: to.toISOString() },
        }).catch((e) => {
          console.warn("[agenda] ics fetch failed", e);
          return [] as Awaited<ReturnType<typeof fetchIcs>>;
        }),
      ]);

      if (apptRes.error) console.error("[agenda]", apptRes.error);

      const merged: DisplayEvent[] = [];
      for (const a of apptRes.data ?? []) {
        merged.push({
          id: `appt:${a.id}`,
          source: "appointment",
          sourceLabel: "Eigen",
          color: "#64748b",
          title: a.title,
          date: a.date,
          startTime: a.start_time ? a.start_time.slice(0, 5) : null,
          endTime: a.end_time ? a.end_time.slice(0, 5) : null,
          href: `/agenda/${a.id}`,
        });
      }
      for (const e of icsRes ?? []) {
        const start = new Date(e.start_time);
        const end = e.end_time ? new Date(e.end_time) : null;
        merged.push({
          id: `ics:${e.id}`,
          source: "ics",
          sourceLabel: e.calendar_name,
          color: e.calendar_color,
          title: e.summary || "(geen titel)",
          date: isoDateOf(start),
          startTime: e.is_all_day ? null : hhmm(start),
          endTime: e.is_all_day || !end ? null : hhmm(end),
          href: null,
        });
      }

      // sort overall by date asc
      merged.sort((a, b) => a.date.localeCompare(b.date));
      setItems(merged);
      setLoading(false);
    })();
  }, [user, fetchIcs]);

  const today = todayISO();
  const upcoming = items.filter((a) => a.date >= today);
  const past = items.filter((a) => a.date < today).reverse();

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Agenda</h1>
          <p className="mt-2 text-muted-foreground">
            Je afspraken in rustig overzicht.
          </p>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/agenda/nieuw">Nieuwe afspraak</Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-20 w-full rounded-3xl" />
          <Skeleton className="h-20 w-full rounded-3xl" />
        </div>
      ) : items.length === 0 ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Nog geen afspraken in je agenda.
        </Card>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <ApptList groups={groupByDay(upcoming)} />
          ) : (
            <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Geen aankomende afspraken.
            </Card>
          )}

          {past.length > 0 && (
            <Collapsible className="mt-10">
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
                Eerder ({past.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <ApptList groups={groupByDay(past)} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </AppShell>
  );
}
