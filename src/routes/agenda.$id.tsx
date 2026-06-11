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

export const Route = createFileRoute("/agenda/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Afspraak" }] }),
  component: AppointmentDetailPage,
});

type Appt = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
};

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function AppointmentDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appt, setAppt] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, date, start_time, end_time")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) console.error("[appointment detail]", error);
      setAppt(data);
      setLoading(false);
    })();
  }, [id, user]);

  const handleDelete = async () => {
    if (!user || !appt) return;
    setDeleting(true);
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appt.id)
      .eq("user_id", user.id);
    setDeleting(false);
    if (error) {
      console.error("[appointment delete]", error);
      toast.error("Het verwijderen lukte niet. Je afspraak is niet weggehaald.");
      return;
    }
    toast.success("De afspraak is verwijderd.");
    navigate({ to: "/agenda" });
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/agenda" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug naar agenda
        </Link>
      </div>

      {loading ? (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <Skeleton className="mt-3 h-4 w-1/3 rounded-full" />
          <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
        </Card>
      ) : !appt ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Deze afspraak konden we niet vinden.
        </Card>
      ) : (
        <>
          <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
            <h1 className="text-2xl text-foreground">{appt.title}</h1>
            <p className="mt-2 text-sm capitalize text-muted-foreground">
              {formatDay(appt.date)}
              {appt.start_time
                ? ` · ${appt.start_time.slice(0, 5)}${
                    appt.end_time ? ` – ${appt.end_time.slice(0, 5)}` : ""
                  }`
                : " · Hele dag"}
            </p>
            {appt.description && (
              <p className="mt-5 whitespace-pre-wrap text-sm text-foreground/80">
                {appt.description}
              </p>
            )}
          </Card>

          <div className="mt-6 flex gap-3">
            <Button asChild size="lg" className="flex-1 rounded-full">
              <Link to="/agenda/$id/bewerken" params={{ id: appt.id }}>
                Bewerken
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Verwijderen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Weet je zeker dat je deze afspraak wilt verwijderen?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Dit kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-full bg-destructive/90 text-destructive-foreground hover:bg-destructive"
                  >
                    {deleting ? "Verwijderen…" : "Verwijderen"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </AppShell>
  );
}
