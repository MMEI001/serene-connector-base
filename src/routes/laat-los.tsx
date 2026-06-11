import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/laat-los")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Laat los" }] }),
  component: LetGoPage,
});

type Item = {
  id: string;
  content: string;
  action_intent: string | null;
  created_at: string;
};

function LetGoPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("let_go_items")
        .select("id, content, action_intent, created_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) console.error("[let_go]", error);
      setItems(data ?? []);
    })();
  }, [user]);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Laat los</h1>
        <p className="mt-2 text-muted-foreground">
          Dingen die mogen gaan. Adem rustig uit.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <Card key={i.id} className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
              <p className="whitespace-pre-wrap text-sm text-foreground">{i.content}</p>
              {i.action_intent && (
                <p className="mt-3 text-xs text-muted-foreground">{i.action_intent}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
