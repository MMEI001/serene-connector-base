import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  fetchGoogleCalendars,
  getCalendarPreferences,
  setCalendarPreference,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar.functions";
import { IcsCalendarsSection } from "@/components/ics-calendars-section";

export const Route = createFileRoute("/agendas/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Agenda's" }] }),
  component: AgendasPage,
});

type Cal = { id: string; summary: string; backgroundColor: string | null };

function AgendasPage() {
  const { user, loading: authLoading } = useAuth();
  const fetchCals = useServerFn(fetchGoogleCalendars);
  const fetchPrefs = useServerFn(getCalendarPreferences);
  const savePref = useServerFn(setCalendarPreference);
  const disconnect = useServerFn(disconnectGoogleCalendar);

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [calendars, setCalendars] = useState<Cal[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [calsRes, prefsRes] = await Promise.all([fetchCals(), fetchPrefs()]);
      setConnected(calsRes.connected);
      setCalendars(calsRes.calendars);
      const map: Record<string, boolean> = {};
      for (const p of prefsRes) map[p.calendar_id] = p.enabled;
      setPrefs(map);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Er ging iets mis";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function handleConnect() {
    setConnecting(true);
    const redirectTo = `${window.location.origin}/agendas/callback`;
    try {
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "https://www.googleapis.com/auth/calendar.readonly",
          redirectTo,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (oauthErr) {
        console.error("Google Calendar signInWithOAuth failed:", oauthErr, {
          name: oauthErr.name,
          message: oauthErr.message,
          status: (oauthErr as { status?: number }).status,
        });
        setConnecting(false);
        toast.error(`Koppelen lukte niet: ${oauthErr.message}`);
        return;
      }
      console.info("signInWithOAuth initiated", data);
    } catch (err) {
      console.error("Google Calendar signInWithOAuth threw:", err);
      setConnecting(false);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Koppelen lukte niet: ${msg}`);
    }
  }

  async function handleToggle(calId: string, value: boolean) {
    setPrefs((p) => ({ ...p, [calId]: value }));
    try {
      await savePref({ data: { calendarId: calId, enabled: value } });
    } catch {
      setPrefs((p) => ({ ...p, [calId]: !value }));
      toast.error("Kon voorkeur niet opslaan");
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      setConnected(false);
      setCalendars([]);
      toast.success("Koppeling verwijderd");
    } catch {
      toast.error("Ontkoppelen lukte niet");
    }
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Agenda's</h1>
        <p className="mt-2 text-muted-foreground">
          Koppel je Google Agenda zodat HoofdRust met je mee kan denken.
        </p>
      </div>

      {!user && !authLoading && (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-sm text-muted-foreground shadow-sm">
          Log eerst in om je agenda's te koppelen.
        </Card>
      )}

      {user && loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-3xl" />
        </div>
      )}

      {user && !loading && !connected && (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <h2 className="text-base text-foreground">Nog niet gekoppeld</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Geef HoofdRust toegang om je agenda's te lezen. We veranderen
            niets — alleen meekijken.
          </p>
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="mt-6 w-full rounded-full"
            size="lg"
          >
            {connecting ? "Bezig…" : "Koppel Google Agenda"}
          </Button>
          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
        </Card>
      )}

      {user && !loading && connected && (
        <>
          {error ? (
            <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
              <p className="text-sm text-foreground">{error}</p>
              <Button
                onClick={handleConnect}
                className="mt-4 w-full rounded-full"
              >
                Opnieuw koppelen
              </Button>
            </Card>
          ) : (
            <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
              <h2 className="text-base text-foreground">Jouw agenda's</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Zet aan welke agenda's HoofdRust mag meenemen.
              </p>
              <ul className="mt-6 space-y-3">
                {calendars.map((c) => {
                  const enabled = prefs[c.id] ?? true;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.backgroundColor ?? "#cbd5e1" }}
                        aria-hidden
                      />
                      <span className="flex-1 text-sm text-foreground">
                        {c.summary}
                      </span>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => handleToggle(c.id, v)}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card className="mt-6 rounded-3xl border-border/60 bg-card/60 p-6 shadow-sm">
            <h2 className="text-base text-foreground">Koppeling</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wil je de toegang stoppen? Je kunt later altijd opnieuw koppelen.
            </p>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="mt-4 w-full rounded-full"
            >
              Koppeling verwijderen
            </Button>
          </Card>
        </>
      )}

      {user && <IcsCalendarsSection />}
    </AppShell>
  );
}
