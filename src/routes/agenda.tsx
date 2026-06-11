import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/agenda")({
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

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function AgendaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Appt[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, date, start_time, end_time")
        .eq("user_id", user.id)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true });
      if (error) console.error("[agenda]", error);
      setItems(data ?? []);
    })();
  }, [user]);

  const grouped = items.reduce<Record<string, Appt[]>>((acc, a) => {
    (acc[a.date] ||= []).push(a);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Agenda</h1>
        <p className="mt-2 text-muted-foreground">Je afspraken in rustig overzicht.</p>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-3 text-sm capitalize text-muted-foreground">
                {formatDay(day)}
              </h2>
              <div className="space-y-3">
                {list.map((a) => (
                  <Card key={a.id} className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-base text-foreground">{a.title}</h3>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {a.start_time
                          ? `${a.start_time.slice(0, 5)}${a.end_time ? `–${a.end_time.slice(0, 5)}` : ""}`
                          : "Hele dag"}
                      </span>
                    </div>
                    {a.description && (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                        {a.description}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
