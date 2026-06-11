import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { ReminderForm, type ReminderFormValues } from "@/components/reminder-form";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/reminders/$id/bewerken")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Reminder bewerken" }] }),
  component: EditReminderPage,
});

function EditReminderPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [initial, setInitial] = useState<ReminderFormValues | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("reminders")
        .select("id, title, description, remind_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) console.error("[reminder edit fetch]", error);
      setInitial(data);
      setLoading(false);
    })();
  }, [id, user]);

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          to="/reminders/$id"
          params={{ id }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Terug
        </Link>
        <h1 className="mt-3 text-3xl text-foreground">Reminder bewerken</h1>
      </div>

      {loading ? (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
          <Skeleton className="mt-4 h-10 w-1/2 rounded-xl" />
        </Card>
      ) : !initial ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Deze reminder konden we niet vinden.
        </Card>
      ) : (
        <ReminderForm mode="edit" initial={initial} />
      )}
    </AppShell>
  );
}
