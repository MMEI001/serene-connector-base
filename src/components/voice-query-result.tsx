import { X } from "lucide-react";
import type { QueryResult } from "@/lib/voice/types";

type Props = {
  data: QueryResult;
  onClose?: () => void;
};

export function QueryResultCard({ data, onClose }: Props) {
  if (data.items.length === 0) return null;
  return (
    <div className="mt-4 w-full max-w-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted-foreground">{data.intro}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit overzicht"
            className="shrink-0 rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-foreground/80 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {data.items.map((item) => (
          <li
            key={`${item.kind}-${item.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.when}</p>
            </div>
            {item.source_label && (
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {item.source_label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
