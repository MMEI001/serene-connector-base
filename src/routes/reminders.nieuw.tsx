import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ReminderForm } from "@/components/reminder-form";

export const Route = createFileRoute("/reminders/nieuw")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Nieuwe reminder" }] }),
  component: NewReminderPage,
});

function NewReminderPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/reminders" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug naar reminders
        </Link>
        <h1 className="mt-3 text-3xl text-foreground">Nieuwe reminder</h1>
        <p className="mt-2 text-muted-foreground">
          Een rustige herinnering, in jouw eigen tempo.
        </p>
      </div>
      <ReminderForm mode="create" />
    </AppShell>
  );
}
