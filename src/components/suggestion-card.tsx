import { useState } from "react";
import { Calendar, Bell, FileText, Leaf } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type Suggestion = {
  id: string;
  title: string | null;
  content: string | null;
  suggestion_type: string;
  proposed_date: string | null;
  proposed_time: string | null;
};

const ICONS: Record<string, typeof Calendar> = {
  appointment: Calendar,
  reminder: Bell,
  note: FileText,
  let_go: Leaf,
};

const TYPE_LABEL: Record<string, string> = {
  appointment: "Afspraak",
  reminder: "Reminder",
  note: "Notitie",
  let_go: "Laat los",
};

function formatProposed(date: string | null, time: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
  return time ? `${d} · ${time.slice(0, 5)}` : d;
}

export function SuggestionCard({
  suggestion,
  userId,
  onChanged,
  compact = false,
}: {
  suggestion: Suggestion;
  userId: string;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = ICONS[suggestion.suggestion_type] ?? FileText;

  async function handleAccept() {
    setBusy(true);
    try {
      const s = suggestion;
      let insertError: { message: string } | null = null;
      let successMsg = "";

      if (s.suggestion_type === "appointment") {
        if (!s.proposed_date) {
          toast.error("Dit voorstel mist een datum.");
          setBusy(false);
          return;
        }
        const { error } = await supabase.from("appointments").insert({
          user_id: userId,
          title: s.title ?? "Zonder titel",
          description: s.content,
          date: s.proposed_date,
          start_time: s.proposed_time,
          source: "confirmed_from_ai",
          status: "scheduled",
        });
        insertError = error;
        successMsg = "Toegevoegd aan je agenda.";
      } else if (s.suggestion_type === "reminder") {
        let remindAt: string | null = null;
        if (s.proposed_date) {
          remindAt = `${s.proposed_date}T${(s.proposed_time ?? "09:00").slice(0, 8).padEnd(8, ":00").slice(0, 8)}`;
        }
        const { error } = await supabase.from("reminders").insert({
          user_id: userId,
          title: s.title ?? "Zonder titel",
          description: s.content,
          remind_at: remindAt,
          source: "confirmed_from_ai",
          status: "active",
        });
        insertError = error;
        successMsg = "Reminder aangemaakt.";
      } else if (s.suggestion_type === "note") {
        const { error } = await supabase.from("notes").insert({
          user_id: userId,
          title: s.title,
          content: s.content ?? s.title ?? "",
          status: "active",
        });
        insertError = error;
        successMsg = "Notitie opgeslagen.";
      } else if (s.suggestion_type === "let_go") {
        const { error } = await supabase.from("let_go_items").insert({
          user_id: userId,
          content: s.content ?? s.title ?? "",
          status: "active",
        });
        insertError = error;
        successMsg = "Bewaard onder Laat los.";
      } else {
        toast.error("Onbekend type voorstel.");
        setBusy(false);
        return;
      }

      if (insertError) {
        toast.error("Dit lukte nu even niet. Het voorstel staat nog open.");
        setBusy(false);
        return;
      }

      const { error: updErr } = await supabase
        .from("ai_suggestions")
        .update({ status: "accepted" })
        .eq("id", s.id)
        .eq("user_id", userId);
      if (updErr) {
        toast.error("Dit lukte nu even niet. Het voorstel staat nog open.");
        setBusy(false);
        return;
      }
      toast.success(successMsg);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    setBusy(true);
    const { error } = await supabase
      .from("ai_suggestions")
      .update({ status: "dismissed" })
      .eq("id", suggestion.id)
      .eq("user_id", userId);
    setBusy(false);
    if (error) {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Voorstel afgewezen.");
    onChanged();
  }

  async function handleDelete() {
    setBusy(true);
    const { error } = await supabase
      .from("ai_suggestions")
      .update({ status: "deleted" })
      .eq("id", suggestion.id)
      .eq("user_id", userId);
    setBusy(false);
    setConfirmDelete(false);
    if (error) {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Voorstel verwijderd.");
    onChanged();
  }

  const proposed = formatProposed(suggestion.proposed_date, suggestion.proposed_time);

  return (
    <>
      <Card className="rounded-3xl border-border/60 bg-card/80 p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-0.5 text-xs text-accent-foreground">
            <Icon className="h-3 w-3" />
            {TYPE_LABEL[suggestion.suggestion_type] ?? suggestion.suggestion_type}
          </span>
          {proposed && suggestion.suggestion_type === "appointment" && (
            <span className="shrink-0 text-xs text-muted-foreground">{proposed}</span>
          )}
        </div>
        {suggestion.title && (
          <h3 className="mt-2 text-base text-foreground">{suggestion.title}</h3>
        )}
        {suggestion.content && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {suggestion.content}
          </p>
        )}
        {!compact && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleAccept} disabled={busy} className="rounded-full">
              Accepteren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              disabled={busy}
              className="rounded-full"
            >
              Afwijzen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="rounded-full text-muted-foreground"
            >
              Verwijderen
            </Button>
          </div>
        )}
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voorstel verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je dit voorstel wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
