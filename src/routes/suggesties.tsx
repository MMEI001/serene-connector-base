import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/suggesties")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Suggesties" }] }),
  component: SuggestionsPage,
});

type Suggestion = {
  id: string;
  title: string | null;
  content: string | null;
  suggestion_type: string;
  proposed_date: string | null;
  proposed_time: string | null;
  created_at: string;
};

function SuggestionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("ai_suggestions")
        .select("id, title, content, suggestion_type, proposed_date, proposed_time, created_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) console.error("[suggesties]", error);
      setItems(data ?? []);
    })();
  }, [user]);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Voorstellen</h1>
        <p className="mt-2 text-muted-foreground">
          Zachte ideeën om mee te nemen, of niet.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id} className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-block rounded-full bg-accent px-3 py-0.5 text-xs text-accent-foreground">
                  {s.suggestion_type}
                </span>
                {s.proposed_date && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(`${s.proposed_date}T00:00:00`).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                    })}
                    {s.proposed_time ? ` · ${s.proposed_time.slice(0, 5)}` : ""}
                  </span>
                )}
              </div>
              {s.title && <h3 className="mt-2 text-base text-foreground">{s.title}</h3>}
              {s.content && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {s.content}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
