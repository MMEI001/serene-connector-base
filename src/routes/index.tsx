import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "HoofdRust — Rustig dagboek & stemming" },
      {
        name: "description",
        content:
          "Een rustige, warme plek om dagelijks je gedachten en stemming bij te houden.",
      },
    ],
  }),
  component: Dashboard,
});

type Entry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  created_at: string;
};

function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      setDisplayName(profile?.display_name ?? "");

      const { data: list } = await supabase
        .from("journal_entries")
        .select("id, title, content, mood, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      setEntries(list ?? []);
    })();
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-primary/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <section className="mb-10">
          <p className="text-sm text-muted-foreground">Fijn dat je er bent</p>
          <h1 className="mt-1 text-3xl text-foreground">
            {displayName ? `Welkom, ${displayName}` : "Welkom"}
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Neem even een momentje voor jezelf. Schrijf op wat er in je opkomt
            en hoe je je voelt.
          </p>
          <Button
            asChild
            className="mt-6 rounded-full px-6"
            size="lg"
          >
            <Link to="/journal">Nieuwe notitie schrijven</Link>
          </Button>
        </section>

        <section>
          <h2 className="mb-4 text-lg text-foreground">Recente notities</h2>
          {entries.length === 0 ? (
            <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Nog geen notities. Begin met je eerste momentje.
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <Card
                  key={e.id}
                  className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base text-foreground">
                      {e.title || "Notitie"}
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  {e.mood && (
                    <span className="mt-2 inline-block rounded-full bg-accent px-3 py-0.5 text-xs text-accent-foreground">
                      {e.mood}
                    </span>
                  )}
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {e.content}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
