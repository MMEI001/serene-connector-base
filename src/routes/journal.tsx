import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/journal")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Journal" }] }),
  component: JournalPage,
});

const MOODS = ["rustig", "blij", "gespannen", "verdrietig", "neutraal"] as const;
type Mood = (typeof MOODS)[number];

type Entry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  created_at: string;
};

function JournalPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<Mood>("rustig");
  const [moodScore, setMoodScore] = useState(5);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, title, content, mood, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[fetch entries]", error);
      return;
    }
    setEntries(data ?? []);
  }, [user]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!content.trim()) {
      toast.error("Schrijf even iets in je notitie");
      return;
    }
    setBusy(true);
    try {
      const { error: jErr } = await supabase.from("journal_entries").insert({
        user_id: user.id,
        title: title.trim() || null,
        content: content.trim(),
        mood,
      });
      if (jErr) throw jErr;

      const { error: mErr } = await supabase.from("mood_logs").insert({
        user_id: user.id,
        mood_score: moodScore,
        mood,
        note: note.trim() || null,
      });
      if (mErr) throw mErr;

      toast.success("Je notitie is opgeslagen");
      setTitle("");
      setContent("");
      setMood("rustig");
      setMoodScore(5);
      setNote("");
      await fetchEntries();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Opslaan lukte niet";
      console.error("[journal save]", err);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

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
        <div className="mb-8">
          <h1 className="text-3xl text-foreground">Journal</h1>
          <p className="mt-2 text-muted-foreground">
            Adem rustig in en uit. Schrijf wat er in je opkomt.
          </p>
        </div>

        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Titel (optioneel)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
                placeholder="Een korte titel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Je gedachten</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="rounded-2xl"
                placeholder="Vandaag voel ik…"
              />
            </div>

            <div className="space-y-3">
              <Label>Hoe voel je je?</Label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(m)}
                    className={[
                      "rounded-full px-4 py-1.5 text-sm transition-colors",
                      mood === m
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-accent/60 text-accent-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label>Stemmingscore</Label>
                <span className="text-sm text-muted-foreground">
                  {moodScore} / 10
                </span>
              </div>
              <Slider
                value={[moodScore]}
                onValueChange={(v) => setMoodScore(v[0] ?? 5)}
                min={1}
                max={10}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Korte toelichting (optioneel)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-xl"
                placeholder="Iets wat je wilt onthouden"
              />
            </div>

            <Button
              type="submit"
              disabled={busy}
              size="lg"
              className="w-full rounded-full"
            >
              {busy ? "Opslaan…" : "Opslaan"}
            </Button>
          </form>
        </Card>

        <section className="mt-10">
          <h2 className="mb-4 text-lg text-foreground">Jouw notities</h2>
          {entries.length === 0 ? (
            <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
              Nog geen notities. Schrijf hierboven je eerste.
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
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {e.mood && (
                    <span className="mt-2 inline-block rounded-full bg-accent px-3 py-0.5 text-xs text-accent-foreground">
                      {e.mood}
                    </span>
                  )}
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
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
