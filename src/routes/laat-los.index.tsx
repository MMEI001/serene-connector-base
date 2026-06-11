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

export const Route = createFileRoute("/laat-los/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Laat los" }] }),
  component: LetGoPage,
});

type Item = {
  id: string;
  content: string;
  status: "active" | "archived" | "processed";
  created_at: string;
};

function formatCreated(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "vandaag";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

function preview(text: string) {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= 120) return firstLine;
  return firstLine.slice(0, 117) + "…";
}

function LetGoPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError(false);
      const { data, error } = await supabase
        .from("let_go_items")
        .select("id, content, status, created_at")
        .eq("user_id", user.id)
        .in("status", ["active", "archived"])
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[let_go]", error);
        setError(true);
      }
      setItems((data ?? []) as Item[]);
      setLoading(false);
    })();
  }, [user]);

  const active = items.filter((i) => i.status === "active");
  const archived = items.filter((i) => i.status === "archived");

  return (
    <AppShell>
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Laat los</h1>
          <p className="mt-2 text-muted-foreground">
            Een rustige plek voor wat uit je hoofd mag.
          </p>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/laat-los/nieuw">Iets loslaten</Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-3xl" />
          <Skeleton className="h-24 w-full rounded-3xl" />
        </div>
      ) : error ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Dit lukte nu even niet. Probeer het zo nog eens.
        </Card>
      ) : active.length === 0 && archived.length === 0 ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-10 text-center text-sm text-muted-foreground shadow-sm">
          Niets om los te laten op dit moment.
        </Card>
      ) : (
        <div className="space-y-10">
          {active.length > 0 ? (
            <section>
              <h2 className="mb-4 text-sm text-muted-foreground">Actief</h2>
              <ItemList list={active} />
            </section>
          ) : (
            <Card className="rounded-3xl border-border/60 bg-card/60 p-10 text-center text-sm text-muted-foreground shadow-sm">
              Niets om los te laten op dit moment.
            </Card>
          )}

          {archived.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
                Gearchiveerd ({archived.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <ItemList list={archived} muted />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </AppShell>
  );
}

function ItemList({ list, muted }: { list: Item[]; muted?: boolean }) {
  return (
    <div className="space-y-3">
      {list.map((i) => (
        <Link
          key={i.id}
          to="/laat-los/$id"
          params={{ id: i.id }}
          className="block"
        >
          <Card
            className={`rounded-3xl border-border/60 p-6 shadow-sm transition-colors hover:bg-card ${
              muted ? "bg-card/40" : "bg-card/70"
            }`}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {preview(i.content)}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatCreated(i.created_at)}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
