import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/laat-los/nieuw")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Iets loslaten" }] }),
  component: NewLetGoPage,
});

function NewLetGoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!content.trim()) {
      toast.error("Schrijf eerst even wat je wilt loslaten.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("let_go_items").insert({
      user_id: user.id,
      content: content.trim(),
      status: "active",
    });
    setBusy(false);
    if (error) {
      console.error("[let_go create]", error);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Dit is los van je agenda bewaard.");
    navigate({ to: "/laat-los" });
  };

  return (
    <AppShell>
      <div className="mb-8">
        <Link to="/laat-los" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug
        </Link>
        <h1 className="mt-3 text-3xl text-foreground">Iets loslaten</h1>
        <p className="mt-2 text-muted-foreground">
          Zet het hier neer. Het wordt geen taak en geen herinnering.
        </p>
      </div>

      <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="content">Wat wil je loslaten?</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              maxLength={4000}
              autoFocus
              className="rounded-2xl"
              placeholder="Wat wil je loslaten?"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="flex-1 rounded-full"
              onClick={() => navigate({ to: "/laat-los" })}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={busy} size="lg" className="flex-1 rounded-full">
              {busy ? "Opslaan…" : "Loslaten"}
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
