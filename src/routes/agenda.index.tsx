import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, useScroll, useTransform } from "motion/react";
import { Lock, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LoadingOrb } from "@/components/loading-orb";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  date: string;
  startTime: string | null;
  endTime: string | null;
  appointmentId: string | null;
  description?: string | null;
  location?: string | null;
  calendarUrl?: string | null;
  hasReminder?: boolean;
};

type IcsProvider = {
  source: string;
  app: string;
};

function detectIcsProvider(url: string | null | undefined, fallbackName: string): IcsProvider {
  const u = (url ?? "").toLowerCase();
  if (u.includes("icloud.com") || u.includes("me.com")) {
    return { source: "iCloud", app: "je Apple Agenda" };
  }
  if (u.includes("google.com") || u.includes("googleusercontent.com")) {
    return { source: "Google Agenda", app: "Google Agenda" };
  }
  if (u.includes("outlook.") || u.includes("live.com") || u.includes("office.com") || u.includes("office365.com")) {
    return { source: "Outlook", app: "Microsoft Outlook" };
  }
  return { source: fallbackName, app: "de oorspronkelijke agenda-app" };
}

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
  const palette = ["#a8b89a", "#d9a5a5", "#a5b5c9", "#d4c896", "#c8b6d9", "#e8d4dc"];
  return palette[h % palette.length];
}

function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDateOf(d);
}

/** Group by day AND fill empty days between first and last with []. */
function groupWithEmptyDays(items: DisplayEvent[]): [string, DisplayEvent[]][] {
  if (items.length === 0) return [];
  const map = new Map<string, DisplayEvent[]>();
  for (const a of items) {
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date)!.push(a);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      if (a.startTime === b.startTime) return 0;
      if (!a.startTime) return -1;
      if (!b.startTime) return 1;
      return a.startTime.localeCompare(b.startTime);
    });
  }
  const sortedDates = [...map.keys()].sort();
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  const result: [string, DisplayEvent[]][] = [];
  for (let d = first; d <= last; d = addDaysISO(d, 1)) {
    result.push([d, map.get(d) ?? []]);
  }
  return result;
}

function DayHeader({ day, today }: { day: string; today: string }) {
  const isToday = day === today;
  return (
    <div className="sticky top-14 z-10 -mx-2 mb-3 flex items-baseline gap-3 bg-[color:var(--background)]/70 px-2 py-2 backdrop-blur-md">
      <h2 className="font-display text-lg capitalize tracking-[-0.02em] text-foreground/90">
        {formatDay(day)}
      </h2>
      {isToday && (
        <span className="rounded-full bg-gradient-to-r from-[#c8b6d9] to-[#e8d4dc] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#3d352e]">
          Vandaag
        </span>
      )}
    </div>
  );
}

function ApptList({
  groups,
  today,
  fillEmpty = false,
  onIcsClick,
}: {
  groups: [string, DisplayEvent[]][];
  today: string;
  fillEmpty?: boolean;
  onIcsClick: (e: DisplayEvent) => void;
}) {
  return (
    <div className="space-y-8">
      {groups.map(([day, list]) => (
        <section key={day}>
          <DayHeader day={day} today={today} />
          {list.length === 0 ? (
            fillEmpty ? (
              <p
                className="px-2 py-4 text-center text-sm italic text-muted-foreground/80"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Niets gepland. Ruimte om te ademen.
              </p>
            ) : null
          ) : (
            <div className="space-y-3">
              {list.map((a, idx) => {
                const span = timeSpan(a);
                const stripe = a.color ?? hashColor(a.sourceLabel);
                const inner = (
                  <div className="relative overflow-hidden rounded-[20px] surface-glass p-5 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5">
                    <span
                      aria-hidden
                      className="absolute inset-y-3 left-0 w-1 rounded-full"
                      style={{ backgroundColor: stripe }}
                    />
                    {a.source === "ics" && (
                      <Lock
                        aria-label="Alleen-lezen agenda"
                        className="absolute right-4 top-4 h-3.5 w-3.5 text-muted-foreground/70"
                        strokeWidth={2}
                      />
                    )}
                    {a.hasReminder && (
                      <Bell
                        aria-label="Gekoppelde reminder"
                        className="absolute right-4 top-4 h-3.5 w-3.5 text-muted-foreground/70"
                        strokeWidth={2}
                      />
                    )}
                    <div className="ml-3 flex items-baseline justify-between gap-3 pr-6">
                      <h3 className="min-w-0 truncate text-[15px] font-medium text-foreground">
                        {a.title}
                      </h3>
                      {span && (
                        <span className="shrink-0 text-mono text-xs text-foreground/70">
                          {span}
                        </span>
                      )}
                    </div>
                    <div className="ml-3 mt-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: stripe }}
                        />
                        {a.sourceLabel}
                      </span>
                    </div>
                  </div>
                );
                const staggerStyle = {
                  ["--stagger" as never]: Math.min(idx, 8),
                };
                if (a.appointmentId) {
                  return (
                    <Link
                      key={a.id}
                      to="/agenda/$id"
                      params={{ id: a.appointmentId }}
                      className="stagger-item block"
                      style={staggerStyle}
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onIcsClick(a)}
                    className="stagger-item block w-full text-left"
                    style={staggerStyle}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          )}
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
  const { scrollY } = useScroll();
  const titleY = useTransform(scrollY, (v) => v * 0.3);
  const [icsDetail, setIcsDetail] = useState<DisplayEvent | null>(null);


  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 60);
      const to = new Date(now);
      to.setDate(to.getDate() + 180);

      const [apptRes, icsRes, remindersRes] = await Promise.all([
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
        supabase
          .from("reminders")
          .select("related_appointment_id" as never)
          .eq("user_id", user.id)
          .not("related_appointment_id", "is", null),
      ]);

      if (apptRes.error) console.error("[agenda]", apptRes.error);

      const linkedApptIds = new Set<string>();
      for (const r of (remindersRes.data ?? []) as Array<{ related_appointment_id: string | null }>) {
        if (r.related_appointment_id) linkedApptIds.add(r.related_appointment_id);
      }

      const merged: DisplayEvent[] = [];
      for (const a of apptRes.data ?? []) {
        merged.push({
          id: `appt:${a.id}`,
          source: "appointment",
          sourceLabel: "Eigen",
          color: "#a8b89a",
          title: a.title,
          date: a.date,
          startTime: a.start_time ? a.start_time.slice(0, 5) : null,
          endTime: a.end_time ? a.end_time.slice(0, 5) : null,
          appointmentId: a.id,
          hasReminder: linkedApptIds.has(a.id),
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
          appointmentId: null,
          description: e.description ?? null,
          location: e.location ?? null,
          calendarUrl: (e as { calendar_url?: string | null }).calendar_url ?? null,
        });
      }

      merged.sort((a, b) => a.date.localeCompare(b.date));
      setItems(merged);
      setLoading(false);
    })();
  }, [user, fetchIcs]);

  const today = todayISO();
  const upcoming = useMemo(
    () => items.filter((a) => a.date >= today),
    [items, today],
  );
  const past = useMemo(
    () => items.filter((a) => a.date < today).reverse(),
    [items, today],
  );
  const upcomingGroups = useMemo(
    () => groupWithEmptyDays(upcoming),
    [upcoming],
  );
  const pastGroups = useMemo(() => groupWithEmptyDays(past), [past]);

  return (
    <AppShell>
      <motion.div
        style={{ y: titleY }}
        className="mb-10 flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-4xl tracking-[-0.02em] text-foreground">
            Agenda
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Je afspraken in rustig overzicht.
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="rounded-full bg-white/70 text-foreground shadow-[var(--shadow-soft)] backdrop-blur-md hover:bg-white"
        >
          <Link to="/agenda/nieuw">Nieuwe afspraak</Link>
        </Button>
      </motion.div>

      {loading ? (
        <LoadingOrb />
      ) : items.length === 0 ? (
        <EmptyState>
          Nog geen agenda gekoppeld. Tik op &lsquo;Nieuwe afspraak&rsquo; om te
          beginnen.
        </EmptyState>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <ApptList groups={upcomingGroups} today={today} fillEmpty onIcsClick={setIcsDetail} />
          ) : (
            <EmptyState>Geen aankomende afspraken.</EmptyState>
          )}

          {past.length > 0 && (
            <Collapsible className="mt-10">
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
                Eerder ({past.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <ApptList groups={pastGroups} today={today} onIcsClick={setIcsDetail} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      <Dialog open={!!icsDetail} onOpenChange={(open) => !open && setIcsDetail(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          {icsDetail && (
            <>
              <DialogHeader>
                <div className="mb-2 flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/80" strokeWidth={2} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Alleen lezen
                  </span>
                </div>
                <DialogTitle className="text-left text-2xl font-display tracking-[-0.02em]">
                  {icsDetail.title}
                </DialogTitle>
                <DialogDescription className="text-left capitalize">
                  {formatDay(icsDetail.date)}
                  {icsDetail.startTime
                    ? ` · ${icsDetail.startTime}${icsDetail.endTime ? ` – ${icsDetail.endTime}` : ""}`
                    : " · Hele dag"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                {icsDetail.location && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Locatie</div>
                    <div className="mt-0.5 text-foreground/90">{icsDetail.location}</div>
                  </div>
                )}
                {icsDetail.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Beschrijving</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-foreground/90">{icsDetail.description}</div>
                  </div>
                )}
                {(() => {
                  const p = detectIcsProvider(icsDetail.calendarUrl, icsDetail.sourceLabel);
                  return (
                    <p className="rounded-2xl bg-muted/40 px-4 py-3 text-xs italic text-muted-foreground">
                      Dit is een afspraak uit {p.source}. Wijzig deze in {p.app}.
                    </p>
                  );
                })()}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                {(() => {
                  if (typeof navigator === "undefined") return null;
                  const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
                  if (!isApple) return null;
                  const [y, m, d] = icsDetail.date.split("-").map(Number);
                  const hhmm = (icsDetail.startTime ?? "00:00").split(":").map(Number);
                  const eventMs = new Date(y, (m ?? 1) - 1, d ?? 1, hhmm[0] ?? 0, hhmm[1] ?? 0).getTime();
                  // calshow: takes seconds since 2001-01-01 UTC (978307200)
                  const calSeconds = Math.floor(eventMs / 1000) - 978307200;
                  return (
                    <Button
                      className="w-full rounded-full"
                      onClick={() => {
                        window.location.href = `calshow:${calSeconds}`;
                      }}
                    >
                      Open in Agenda
                    </Button>
                  );
                })()}
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={() => setIcsDetail(null)}
                >
                  Sluiten
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>

  );
}
