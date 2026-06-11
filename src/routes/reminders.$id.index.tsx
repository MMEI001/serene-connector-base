import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatRemindAt } from "@/lib/reminder-format";

export const Route = createFileRoute("/reminders/$id/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Reminder" }] }),
  component: ReminderDetailPage,
});

type Reminder = {
  id: string;
  title: string;
  description: string | null;
  remind_at: string | null;
  status: "active" | "done" | "snoozed" | "deleted";
};

function snoozeTarget(option: "1u" | "morgen" | "week") {
  const d = new Date();
  if (option === "1u") d.setHours(d.getHours() + 1);
  if (option === "morgen") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  if (option === "week") {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ReminderDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Snooze "kies een moment" state
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("reminders")
        .select("id, title, description, remind_at, status")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) console.error("[reminder detail]", error);
      setReminder(data as Reminder | null);
      setLoading(false);
    })();
  }, [id, user]);

  const handleComplete = async () => {
    if (!user || !reminder) return;
    setBusy(true);
    const { error } = await supabase
      .from("reminders")
      .update({ status: "done" })
      .eq("id", reminder.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      console.error("[reminder complete]", error);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Reminder afgevinkt.");
    navigate({ to: "/reminders" });
  };

  const applySnooze = async (newRemindAt: string) => {
    if (!user || !reminder) return;
    setBusy(true);
    const { error } = await supabase
      .from("reminders")
      .update({ status: "snoozed", remind_at: newRemindAt })
      .eq("id", reminder.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      console.error("[reminder snooze]", error);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Reminder uitgesteld.");
    navigate({ to: "/reminders" });
  };

  const handleCustomSnooze = async () => {
    if (!customDate) {
      toast.error("Kies een datum");
      return;
    }
    const t = customTime || "09:00";
    const local = new Date(`${customDate}T${t}:00`);
    if (Number.isNaN(local.getTime())) {
      toast.error("Datum of tijd is ongeldig");
      return;
    }
    setCustomOpen(false);
    await applySnooze(local.toISOString());
  };

  const handleDelete = async () => {
    if (!user || !reminder) return;
    setBusy(true);
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", reminder.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      console.error("[reminder delete]", error);
      toast.error("Het verwijderen lukte niet. Je reminder is niet weggehaald.");
      return;
    }
    toast.success("De reminder is verwijderd.");
    navigate({ to: "/reminders" });
  };

  const openCustomDialog = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setCustomDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setCustomTime("09:00");
    setCustomOpen(true);
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/reminders" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug naar reminders
        </Link>
      </div>

      {loading ? (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <Skeleton className="mt-3 h-4 w-1/3 rounded-full" />
          <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
        </Card>
      ) : !reminder ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Deze reminder konden we niet vinden.
        </Card>
      ) : (
        <>
          <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
            <h1 className="text-2xl text-foreground">{reminder.title}</h1>
            {reminder.remind_at && (
              <p className="mt-2 text-sm text-muted-foreground">
                {formatRemindAt(reminder.remind_at)}
              </p>
            )}
            {reminder.description && (
              <p className="mt-5 whitespace-pre-wrap text-sm text-foreground/80">
                {reminder.description}
              </p>
            )}
            <p className="mt-5 text-xs text-muted-foreground">
              Status:{" "}
              {reminder.status === "active"
                ? "actief"
                : reminder.status === "snoozed"
                ? "uitgesteld"
                : reminder.status === "done"
                ? "voltooid"
                : reminder.status}
            </p>
          </Card>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {reminder.status !== "done" && (
              <Button
                size="lg"
                onClick={handleComplete}
                disabled={busy}
                className="rounded-full"
              >
                Voltooien
              </Button>
            )}

            {reminder.status !== "done" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={busy}
                    className="rounded-full"
                  >
                    Uitstellen
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-3xl">
                  <DialogHeader>
                    <DialogTitle>Even uitstellen</DialogTitle>
                    <DialogDescription>
                      Wanneer wil je hier weer aan herinnerd worden?
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => applySnooze(snoozeTarget("1u"))}
                    >
                      1 uur
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => applySnooze(snoozeTarget("morgen"))}
                    >
                      Morgen
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => applySnooze(snoozeTarget("week"))}
                    >
                      Volgende week
                    </Button>
                    <Button
                      variant="ghost"
                      className="rounded-full"
                      onClick={openCustomDialog}
                    >
                      Kies een moment
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/reminders/$id/bewerken" params={{ id: reminder.id }}>
                Bewerken
              </Link>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Verwijderen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Weet je zeker dat je deze reminder wilt verwijderen?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Dit kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={busy}
                    className="rounded-full bg-destructive/90 text-destructive-foreground hover:bg-destructive"
                  >
                    Verwijderen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Dialog open={customOpen} onOpenChange={setCustomOpen}>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Kies een moment</DialogTitle>
                <DialogDescription>
                  Wanneer wil je deze reminder weer zien?
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Datum</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Tijd</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setCustomOpen(false)}
                >
                  Annuleren
                </Button>
                <Button
                  className="rounded-full"
                  disabled={busy}
                  onClick={handleCustomSnooze}
                >
                  Uitstellen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AppShell>
  );
}
