import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { AppointmentForm, type AppointmentFormValues } from "@/components/appointment-form";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/agenda/$id/bewerken")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Afspraak bewerken" }] }),
  component: EditAppointmentPage,
});

function EditAppointmentPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [initial, setInitial] = useState<AppointmentFormValues | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (error) console.error("[appointment edit fetch]", error);
      setInitial(data);
      setLoading(false);
    })();
  }, [id, user]);

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          to="/agenda/$id"
          params={{ id }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Terug
        </Link>
        <h1 className="mt-3 text-3xl text-foreground">Afspraak bewerken</h1>
      </div>

      {loading ? (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
          <Skeleton className="mt-4 h-10 w-1/2 rounded-xl" />
        </Card>
      ) : !initial ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Deze afspraak konden we niet vinden.
        </Card>
      ) : (
        <AppointmentForm mode="edit" initial={initial} />
      )}
    </AppShell>
  );
}
