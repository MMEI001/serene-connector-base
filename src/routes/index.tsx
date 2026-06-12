import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SuggestionCard, type Suggestion } from "@/components/suggestion-card";
import { classifyAndStoreSuggestion } from "@/lib/ai-classify.functions";

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

type Appt = { id: string; title: string; start_time: string | null; date: string };
type Reminder = { id: string; title: string; remind_at: string | null };


function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Dashboard() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [appts, setAppts] = useState<Appt[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const classify = useServerFn(classifyAndStoreSuggestion);

  async function handleClassify() {
    const text = aiText.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    try {
      const result = await classify({ data: { text } });
      const labels: Record<string, string> = {
        appointment: "Ik heb een voorstel klaargezet in je voorstellen.",
        reminder: "Ik heb een reminder-voorstel klaargezet.",
        note: "Ik heb dit bewaard als voorstel voor een notitie.",
        let_go: "Ik heb dit bewaard onder je voorstellen om los te laten.",
      };
      let msg = labels[result.suggestion_type] ?? "Voorstel klaargezet.";
      if (result.confidence === "low") {
        msg += " Bekijk het voorstel even, ik wist het niet helemaal zeker.";
      }
      toast.success(msg);
      setAiText("");
      void loadSuggestions();
    } catch {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
    } finally {
      setAiBusy(false);
    }
  }

  const loadSuggestions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_suggestions")
      .select("id, title, content, suggestion_type, proposed_date, proposed_time")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3);
    setSuggestions(data ?? []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const today = todayISO();
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;
    (async () => {
      const [profile, a, r] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("appointments")
          .select("id, title, start_time, date")
          .eq("user_id", user.id)
          .eq("date", today)
          .order("start_time", { ascending: true, nullsFirst: true }),
        supabase
          .from("reminders")
          .select("id, title, remind_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .or(`remind_at.is.null,and(remind_at.gte.${startOfDay},remind_at.lte.${endOfDay})`)
          .order("remind_at", { ascending: true, nullsFirst: true }),
      ]);
      setDisplayName(profile.data?.display_name ?? "");
      setAppts(a.data ?? []);
      setReminders(r.data ?? []);
      void loadSuggestions();
    })();
  }, [user, loadSuggestions]);

  return (
    <AppShell>
      <section className="mb-10">
        <p className="text-sm text-muted-foreground">Fijn dat je er bent</p>
        <h1 className="mt-1 text-3xl text-foreground">
          {displayName ? `Welkom, ${displayName}` : "Welkom"}
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Neem even een momentje voor jezelf. Hieronder vind je je dag in rust.
        </p>
        <Button asChild className="mt-6 rounded-full px-6" size="lg">
          <Link to="/journal">Nieuwe notitie schrijven</Link>
        </Button>
      </section>

      <section className="mb-10">
        <Card className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
          <Textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Wat speelt er in je hoofd? Typ het hier."
            rows={3}
            disabled={aiBusy}
            className="resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Ik bewaar het zorgvuldig en doe niets zonder jouw bevestiging.
            </p>
            <Button
              onClick={handleClassify}
              disabled={aiBusy || !aiText.trim()}
              className="rounded-full px-6"
            >
              {aiBusy ? "Even verwerken…" : "Verwerken"}
            </Button>
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg text-foreground">Vandaag op je agenda</h2>
        {appts.length === 0 ? (
          <EmptyState>Geen afspraken vandaag.</EmptyState>
        ) : (
          <div className="space-y-3">
            {appts.map((a) => (
              <Card key={a.id} className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base text-foreground">{a.title}</h3>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.start_time ? a.start_time.slice(0, 5) : "Hele dag"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg text-foreground">Reminders voor vandaag</h2>
        {reminders.length === 0 ? (
          <EmptyState>Geen actieve reminders voor vandaag.</EmptyState>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <Card key={r.id} className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base text-foreground">{r.title}</h3>
                  {r.remind_at && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(r.remind_at).toLocaleTimeString("nl-NL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg text-foreground">Voorstellen</h2>
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                userId={user!.id}
                onChanged={loadSuggestions}
              />
            ))}
            <div className="pt-1 text-right">
              <Link to="/suggesties" className="text-sm text-primary hover:underline">
                Alle voorstellen bekijken
              </Link>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}
