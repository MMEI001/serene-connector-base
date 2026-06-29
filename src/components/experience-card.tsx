import { Gift } from "lucide-react";

export type ExperienceCardData = {
  kind: "gift_event";
  who: string;
  eventLabel: string;
  whenIso: string | null;
  ideas: string[];
  existingReminder: boolean;
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Amsterdam",
    }).format(d);
  } catch {
    return null;
  }
}

export function ExperienceCard({ data }: { data: ExperienceCardData }) {
  const when = formatWhen(data.whenIso);
  return (
    <div className="mt-4 w-full max-w-xs rounded-2xl bg-white/70 px-4 py-3 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] text-left">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <Gift className="h-4 w-4" />
        Cadeau voor {data.who}
      </div>
      {(when || data.eventLabel) && (
        <div className="mt-0.5 text-xs text-muted-foreground">
          {data.eventLabel}
          {when ? ` · ${when}` : ""}
        </div>
      )}
      <ul className="mt-2 space-y-1 text-sm text-foreground/80">
        {data.ideas.map((idea, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground">·</span>
            <span>{idea}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[11px] italic text-muted-foreground/80">
        {data.existingReminder
          ? "Je had hier al een herinnering voor staan."
          : "Reminder staat klaar — pas aan of bevestig hieronder."}
      </div>
    </div>
  );
}
