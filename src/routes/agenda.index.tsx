import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/agenda/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Agenda" }] }),
  component: AgendaPage,
});

type Appt = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
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

function timeSpan(a: Appt) {
  if (!a.start_time) return null;
  const s = a.start_time.slice(0, 5);
  if (!a.end_time) return s;
  return `${s} – ${a.end_time.slice(0, 5)}`;
}

function groupByDay(items: Appt[]) {
  const map = new Map<string, Appt[]>();
  for (const a of items) {
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date)!.push(a);
  }
  return Array.from(map.entries());
}

function ApptList({ groups }: { groups: [string, Appt[]][] }) {
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
              return (
                <Link
                  key={a.id}
                  to="/agenda/$id"
                  params={{ id: a.id }}
                  className="block"
                >
                  <Card className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm transition-colors hover:bg-card">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-base text-foreground">{a.title}</h3>
                      {span && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {span}
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
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
  const [items, setItems] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, date, start_time, end_time")
        .eq("user_id", user.id)
        .eq("status", "scheduled")
        .order("date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true });
      if (error) console.error("[agenda]", error);
      setItems(data ?? []);
      setLoading(false);
    })();
  }, [user]);

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
