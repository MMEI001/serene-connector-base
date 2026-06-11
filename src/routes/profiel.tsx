import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/profiel")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Profiel" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      setDisplayName(data?.display_name ?? "");
    })();
  }, [user]);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Profiel</h1>
        <p className="mt-2 text-muted-foreground">
          {displayName ? `Hoi, ${displayName}` : "Je persoonlijke plek."}
        </p>
      </div>

      <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
        <h2 className="text-base text-foreground">Voorkeuren</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hier komen binnenkort je persoonlijke voorkeuren te staan, zoals je naam,
          notificaties en stille uren.
        </p>
      </Card>
    </AppShell>
  );
}
