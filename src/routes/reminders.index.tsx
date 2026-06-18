import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LoadingOrb } from "@/components/loading-orb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatRemindAt } from "@/lib/reminder-format";

export const Route = createFileRoute("/reminders/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Reminders" }] }),
  component: RemindersPage,
});

type Reminder = {
  id: string;
  title: string;
  remind_at: string | null;
  status: "active" | "done" | "snoozed" | "deleted";
};

function RemindersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError(false);
      const { data, error } = await supabase
        .from("reminders")
        .select("id, title, remind_at, status")
        .eq("user_id", user.id)
        .neq("status", "deleted")
        .order("remind_at", { ascending: true, nullsFirst: false });
      if (error) {
        console.error("[reminders]", error);
        setError(true);
      }
      setItems((data ?? []) as Reminder[]);
      setLoading(false);
    })();
  }, [user]);

  const active = items.filter((r) => r.status === "active");
  const snoozed = items.filter((r) => r.status === "snoozed");
  const done = items.filter((r) => r.status === "done");

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Reminders</h1>
          <p className="mt-2 text-muted-foreground">
            Zachte herinneringen, in jouw tempo.
          </p>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/reminders/nieuw">Nieuwe reminder</Link>
        </Button>
      </div>

      {loading ? (
        <LoadingOrb />
      ) : error ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Dit lukte nu even niet. Probeer het zo nog eens.
        </Card>
      ) : items.length === 0 ? (
        <EmptyState>
          Nog geen reminders. Tik op de orb om er een toe te voegen.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <Section title="Actief" list={active} />
          <Section title="Uitgesteld" list={snoozed} />

          {done.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
                Voltooid ({done.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <ReminderList list={done} muted />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Section({ title, list }: { title: string; list: Reminder[] }) {
  if (list.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm text-muted-foreground">{title}</h2>
      <ReminderList list={list} />
    </section>
  );
}

function ReminderList({ list, muted }: { list: Reminder[]; muted?: boolean }) {
  return (
    <div className="space-y-3">
      {list.map((r, idx) => {
        const when = formatRemindAt(r.remind_at);
        return (
          <Link
            key={r.id}
            to="/reminders/$id"
            params={{ id: r.id }}
            className="stagger-item block"
            style={{ ["--stagger" as never]: Math.min(idx, 8) }}
          >
            <Card
              className={`rounded-3xl border-border/60 p-5 shadow-sm transition-colors hover:bg-card ${
                muted ? "bg-card/50" : "bg-card/80"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3
                  className={`text-base ${
                    r.status === "done"
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {r.title}
                </h3>
                {when && (
                  <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
                )}
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
