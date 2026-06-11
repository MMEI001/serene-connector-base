import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { SuggestionCard, type Suggestion } from "@/components/suggestion-card";

export const Route = createFileRoute("/suggesties")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Suggesties" }] }),
  component: SuggestionsPage,
});

type HandledSuggestion = Suggestion & { status: string };

function SuggestionsPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [handled, setHandled] = useState<HandledSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(false);
    const [p, h] = await Promise.all([
      supabase
        .from("ai_suggestions")
        .select("id, title, content, suggestion_type, proposed_date, proposed_time")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("ai_suggestions")
        .select("id, title, content, suggestion_type, proposed_date, proposed_time, status")
        .eq("user_id", user.id)
        .in("status", ["accepted", "dismissed"])
        .order("updated_at", { ascending: false }),
    ]);
    if (p.error || h.error) {
      setError(true);
    } else {
      setPending(p.data ?? []);
      setHandled(h.data ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Voorstellen</h1>
        <p className="mt-2 text-muted-foreground">
          Zachte ideeën om mee te nemen, of niet.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
      ) : error ? (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-5 text-sm text-muted-foreground">
          Dit lukte nu even niet. Probeer het zo nog eens.
        </Card>
      ) : pending.length === 0 ? (
        <EmptyState>Geen voorstellen op dit moment.</EmptyState>
      ) : (
        <div className="space-y-3">
          {pending.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              userId={user!.id}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {!loading && !error && handled.length > 0 && (
        <Collapsible className="mt-10">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-foreground">
            <span>Afgehandeld ({handled.length})</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {handled.map((s) => (
              <Card
                key={s.id}
                className="rounded-3xl border-border/60 bg-card/40 p-5 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="inline-block rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">
                    {s.status === "accepted" ? "Geaccepteerd" : "Afgewezen"}
                  </span>
                </div>
                {s.title && (
                  <h3 className="mt-2 text-base text-muted-foreground">{s.title}</h3>
                )}
                {s.content && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground/80">
                    {s.content}
                  </p>
                )}
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </AppShell>
  );
}
