import type { QueryResult } from "@/lib/voice/types";

export function QueryResultCard({ data }: { data: QueryResult }) {
  if (data.items.length === 0) return null;
  return (
    <div className="mt-4 w-full max-w-sm">
      <p className="mb-2 text-center text-sm text-muted-foreground">{data.intro}</p>
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
