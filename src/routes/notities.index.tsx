import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useHaptic } from "@/lib/use-haptic";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/notities/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Notities" }] }),
  component: JournalPage,
});

type Note = {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
};

function JournalPage() {
  const { user } = useAuth();
  const haptic = useHaptic();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("notes")
      .select("id, title, content, created_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[fetch notes]", error);
      toast.error(error.message);
      return;
    }
    setNotes(data ?? []);
  }, [user]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!content.trim()) {
      toast.error("Schrijf even iets in je notitie");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("notes").insert({
        user_id: user.id,
        title: title.trim() || null,
        content: content.trim(),
        status: "active",
      });
      if (error) throw error;

      toast.success("Je notitie is opgeslagen");
      haptic.success();
      setTitle("");
      setContent("");
      await fetchNotes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Opslaan lukte niet";
      console.error("[note save]", err);
      haptic.error();
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Notities</h1>
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
        {notes.length === 0 ? (
          <EmptyState>Een lege bladzijde. Begin wanneer je wilt.</EmptyState>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <Card
                key={n.id}
                className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base text-foreground">
                    {n.title || "Notitie"}
                  </h3>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {n.content}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
