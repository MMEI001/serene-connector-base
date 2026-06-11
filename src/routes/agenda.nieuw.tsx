import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AppointmentForm } from "@/components/appointment-form";

export const Route = createFileRoute("/agenda/nieuw")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Nieuwe afspraak" }] }),
  component: NewAppointmentPage,
});

function NewAppointmentPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/agenda" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug naar agenda
        </Link>
        <h1 className="mt-3 text-3xl text-foreground">Nieuwe afspraak</h1>
        <p className="mt-2 text-muted-foreground">
          Voeg rustig een nieuw moment toe aan je agenda.
        </p>
      </div>
      <AppointmentForm mode="create" />
    </AppShell>
  );
}
