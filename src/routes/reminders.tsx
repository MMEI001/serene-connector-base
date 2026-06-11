import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/reminders")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Reminders" }] }),
  component: RemindersPage,
});

type Reminder = {
  id: string;
  title: string;
  description: string | null;
  remind_at: string | null;
  status: string;
};

function RemindersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select("id, title, description, remind_at, status")
        .eq("user_id", user.id)
        .order("status", { ascending: true })
        .order("remind_at", { ascending: true, nullsFirst: true });
      if (error) console.error("[reminders]", error);
      setItems(data ?? []);
    })();
  }, [user]);

  const active = items.filter((r) => r.status === "active");
  const rest = items.filter((r) => r.status !== "active");

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Reminders</h1>
        <p className="mt-2 text-muted-foreground">Zachte herinneringen, in jouw tempo.</p>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          <Section title="Actief" list={active} />
          {rest.length > 0 && <Section title="Eerder" list={rest} muted />}
        </div>
      )}
    </AppShell>
  );
}

function Section({ title, list, muted }: { title: string; list: Reminder[]; muted?: boolean }) {
  if (list.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {list.map((r) => (
          <Card
            key={r.id}
            className={`rounded-3xl border-border/60 p-5 shadow-sm ${muted ? "bg-card/50" : "bg-card/80"}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base text-foreground">{r.title}</h3>
              {r.remind_at && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(r.remind_at).toLocaleString("nl-NL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            {r.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {r.description}
              </p>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
