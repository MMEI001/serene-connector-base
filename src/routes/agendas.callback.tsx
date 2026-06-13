import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveGoogleTokens } from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/agendas/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Koppelen" }] }),
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const save = useServerFn(saveGoogleTokens);
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Bezig met koppelen…");

  useEffect(() => {
    let done = false;

    async function persist(session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) {
      if (done || !session) return;
      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;
      if (!providerToken) return;
      done = true;
      try {
        await save({
          data: {
            providerToken,
            providerRefreshToken: providerRefreshToken ?? null,
            expiresIn: 3600,
          },
        });
        navigate({ to: "/agendas" });
      } catch {
        setStatus("error");
        setMessage("Koppelen lukte niet. Probeer het opnieuw.");
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void persist(session);
    });
    supabase.auth.getSession().then(({ data }) => {
      void persist(data.session);
      // Fallback: if nothing happens within 5s, show error
      setTimeout(() => {
        if (!done) {
          setStatus("error");
          setMessage(
            "We kregen geen toegang van Google. Probeer opnieuw te koppelen.",
          );
        }
      }, 5000);
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate, save]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md py-12 text-center">
        <Card className="rounded-3xl border-border/60 bg-card/80 p-8 shadow-sm">
          <p className="text-sm text-foreground">{message}</p>
          {status === "error" && (
            <Button
              onClick={() => navigate({ to: "/agendas" })}
              className="mt-6 w-full rounded-full"
            >
              Terug naar agenda's
            </Button>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
