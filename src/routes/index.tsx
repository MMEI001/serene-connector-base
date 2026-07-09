import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Volume2, ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { VoiceOrb } from "@/components/voice-orb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SuggestionCard, type Suggestion } from "@/components/suggestion-card";
import { classifyAndStoreSuggestion } from "@/lib/ai-classify.functions";
import { analyzeScreenshotForAppointment } from "@/lib/analyze-screenshot.functions";
import { getDailyBriefing, type DailyBriefing } from "@/lib/daily-briefing.functions";
import { speakText } from "@/lib/speak";

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


const pills = [
  { label: "Iets loslaten", to: "/laat-los" as const },
  { label: "Een notitie maken", to: "/notities" as const },
  { label: "Mijn agenda", to: "/agenda" as const },
];

function Dashboard() {
  const { user } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [showPills, setShowPills] = useState(false);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [askBriefing, setAskBriefing] = useState(false);
  const briefingSpokenRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const classify = useServerFn(classifyAndStoreSuggestion);
  const analyzeScreenshot = useServerFn(analyzeScreenshotForAppointment);
  const fetchBriefing = useServerFn(getDailyBriefing);

  useEffect(() => {
    const t = window.setTimeout(() => setShowPills(true), 800);
    return () => window.clearTimeout(t);
  }, []);

  const playBriefing = useCallback(
    (b: DailyBriefing) => {
      void speakText(b.text, { intent: "daily_briefing", route: "assistant_reply" });
    },
    [],
  );

  const loadBriefing = useCallback(
    async (autoAsk: boolean) => {
      if (!user) return;
      try {
        const b = await fetchBriefing();
        setBriefing(b);
        if (!autoAsk) return;
        const today = new Date().toISOString().slice(0, 10);
        const key = `hoofdrust:daily-briefing-ask:${user.id}:${today}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(key)) {
          window.localStorage.setItem(key, "1");
          briefingSpokenRef.current = true;
          setAskBriefing(true);
          window.setTimeout(() => {
            void speakText(
              "Wil je horen wat er vandaag op je planning staat? Zeg ja of nee.",
              { intent: "daily_briefing_ask", route: "assistant_reply" },
            );
          }, 900);
        }
      } catch {
        /* stil falen — dagoverzicht is niet-kritisch */
      }
    },
    [user, fetchBriefing],
  );

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
      const baseMsg = labels[result.suggestion_type] ?? "Voorstel klaargezet.";
      let msg = baseMsg;
      if (result.confidence === "low") {
        msg += " Bekijk het voorstel even, ik wist het niet helemaal zeker.";
      }
      toast.success(msg);
      void speakText(baseMsg);
      setAiText("");
      void loadSuggestions();
    } catch {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
    } finally {
      setAiBusy(false);
    }
  }


  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Kon afbeelding niet lezen."));
      reader.readAsDataURL(file);
    });
  }

  async function handleScreenshot(file: File) {
    if (screenshotBusy) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Kies een afbeelding (bijv. een screenshot).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Deze afbeelding is te groot (max 8MB).");
      return;
    }
    setScreenshotBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const note = aiText.trim();
      const result = await analyzeScreenshot({ data: { imageDataUrl: dataUrl, note } });
      const spoken =
        result.suggestion_type === "appointment"
          ? "Ik heb een afspraak-voorstel klaargezet."
          : result.suggestion_type === "reminder"
            ? "Ik heb een herinnering-voorstel klaargezet."
            : "Ik heb de screenshot bewaard als voorstel.";
      toast.success(result.summary || spoken);
      void speakText(spoken);
      setAiText("");
      void loadSuggestions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Dit lukte nu even niet.";
      toast.error(msg);
    } finally {
      setScreenshotBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      const [a, r] = await Promise.all([
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
      setAppts(a.data ?? []);
      setReminders(r.data ?? []);
      void loadSuggestions();
      void loadBriefing(true);
    })();
  }, [user, loadSuggestions, loadBriefing]);

  return (
    <AppShell>
      <section className="flex flex-col items-center pt-2 text-center">
        <div className="my-6">
          <VoiceOrb onCompleted={() => void loadSuggestions()} />
        </div>


        <motion.div
          className="mt-6 flex flex-wrap justify-center gap-2.5"
          initial={{ opacity: 0, y: 8 }}
          animate={showPills ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {pills.map((p) => (
            <Link
              key={p.label}
              to={p.to}
              className="shrink-0 rounded-full bg-white/70 px-4 py-2 text-xs font-medium text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.02] active:scale-95"
            >
              {p.label}
            </Link>
          ))}
        </motion.div>

        {askBriefing && briefing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-6 w-full max-w-sm rounded-3xl bg-white/70 px-5 py-4 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] text-center"
          >
            <p className="text-sm text-foreground/85">
              Wil je horen wat er vandaag op je planning staat?
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button
                className="rounded-full px-6"
                onClick={() => {
                  setAskBriefing(false);
                  if (briefing) playBriefing(briefing);
                }}
              >
                Ja, graag
              </Button>
              <Button
                variant="ghost"
                className="rounded-full px-6"
                onClick={() => {
                  setAskBriefing(false);
                  void speakText("Prima, ik houd het rustig.", {
                    intent: "daily_briefing_ask",
                    route: "assistant_reply",
                  });
                }}
              >
                Nee, dank je
              </Button>
            </div>
          </motion.div>
        )}

        {briefing && (briefing.nextEvent || briefing.topReminder || briefing.freeBlock) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 w-full max-w-sm rounded-3xl bg-white/60 px-5 py-4 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] text-left"
          >
            {briefing.nextEvent && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Eerstvolgende</span>
                <span className="text-xs text-muted-foreground">
                  {briefing.nextEvent.date === new Date().toISOString().slice(0, 10)
                    ? briefing.nextEvent.startTime
                    : new Date(briefing.nextEvent.whenIso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}
                </span>
              </div>
            )}
            {briefing.nextEvent && (
              <div className="mt-1 text-sm text-foreground/85">{briefing.nextEvent.title}</div>
            )}
            {briefing.topReminder && (
              <div className={briefing.nextEvent ? "mt-3 pt-3 border-t border-white/60" : ""}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Herinnering</div>
                <div className="mt-1 text-sm text-foreground/85">{briefing.topReminder.title}</div>
              </div>
            )}
            {briefing.freeBlock && !briefing.nextEvent && (
              <div className="text-sm text-foreground/85">
                Later vandaag heb je ruimte tussen {briefing.freeBlock.start} en {briefing.freeBlock.end}.
              </div>
            )}
            <button
              type="button"
              onClick={() => playBriefing(briefing)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5" />
              Dagoverzicht opnieuw horen
            </button>
          </motion.div>
        )}
      </section>

      <section className="mt-14 mb-10">
        <Card className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
          <Textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Liever typen? Schrijf het hier."
            rows={3}
            disabled={aiBusy}
            className="resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Ik bewaar het zorgvuldig en doe niets zonder jouw bevestiging.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleScreenshot(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={screenshotBusy || aiBusy}
                className="rounded-full px-4"
                title="Screenshot uploaden — ik haal er een afspraak uit"
              >
                {screenshotBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Lezen…
                  </>
                ) : (
                  <>
                    <ImagePlus className="mr-1.5 h-4 w-4" />
                    Screenshot
                  </>
                )}
              </Button>
              <Button
                onClick={handleClassify}
                disabled={aiBusy || !aiText.trim()}
                className="rounded-full px-6"
              >
                {aiBusy ? "Even verwerken…" : "Verwerken"}
              </Button>
            </div>
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
