/**
 * Engine Trace Panel — tester-only inzicht in hoe HoofdRust denkt.
 *
 * Zichtbaarheid: alleen wanneer localStorage.hr_debug === "1".
 * Toggle via browser console:  localStorage.setItem('hr_debug', '1')
 *
 * Toont per engine: ms-balkje, intent/redenen-chips, tellingen.
 * Geen ruwe gebruikersdata — de trace zelf bevat die ook niet.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { EngineTrace } from "@/lib/assistant/types";

type Props = { trace?: EngineTrace | null };

export function EngineTracePanel({ trace }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(window.localStorage.getItem("hr_debug") === "1");
    const handler = () =>
      setEnabled(window.localStorage.getItem("hr_debug") === "1");
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (!enabled || !trace) return null;

  const engines: Array<{
    name: string;
    ms?: number;
    chips: string[];
  }> = [
    {
      name: "Conversation",
      ms: trace.conversation?.ms,
      chips: trace.conversation
        ? [
            `intent: ${trace.conversation.primary}`,
            `actions: ${trace.conversation.actions_count}`,
            `model: ${trace.conversation.model}`,
            trace.conversation.ambiguous ? "ambiguous" : "",
          ].filter(Boolean)
        : [],
    },
    {
      name: "Memory",
      ms: trace.memory?.ms,
      chips: trace.memory
        ? [
            `persona: ${trace.memory.persona_signature}`,
            `hits: ${trace.memory.hits_count}`,
            ...trace.memory.sources,
          ]
        : [],
    },
    {
      name: "Context",
      ms: trace.context?.ms,
      chips: trace.context
        ? [
            `today: ${trace.context.today_count}`,
            trace.context.has_next_event ? "next_event" : "no_next_event",
          ]
        : [],
    },
    {
      name: "Initiative",
      ms: trace.initiative?.ms,
      chips: trace.initiative
        ? [trace.initiative.allow ? "allow" : "skip", trace.initiative.reason]
        : [],
    },
    {
      name: "Suggestion",
      ms: trace.suggestion?.ms,
      chips: trace.suggestion
        ? [`proposals: ${trace.suggestion.proposals_count}`, ...trace.suggestion.skills]
        : [],
    },
    {
      name: "Decision",
      ms: trace.decision?.ms,
      chips: trace.decision
        ? [
            `kept: ${trace.decision.kept}`,
            `rejected: ${trace.decision.rejected}`,
            ...trace.decision.rejection_reasons,
          ]
        : [],
    },
    {
      name: "Execution",
      ms: trace.execution?.ms,
      chips: trace.execution
        ? [
            trace.execution.status,
            trace.execution.intent,
            trace.execution.used_fallback ? "fallback" : "",
          ].filter(Boolean)
        : [],
    },
  ];

  const max = Math.max(1, ...engines.map((e) => e.ms ?? 0));

  return (
    <div className="mt-6 w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-4 text-xs shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-muted-foreground hover:text-foreground"
      >
        <span className="font-mono">
          🧠 trace · {trace.framework} · {trace.total_ms}ms · slowest:{" "}
          {trace.slowest_engine}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {engines.map((e) => (
            <div key={e.name} className="space-y-1">
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="text-foreground/80">{e.name}</span>
                <span className="text-muted-foreground">
                  {e.ms != null ? `${e.ms}ms` : "—"}
                </span>
              </div>
              {e.ms != null && (
                <div className="h-1 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-foreground/40"
                    style={{ width: `${Math.max(2, (e.ms / max) * 100)}%` }}
                  />
                </div>
              )}
              {e.chips.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {e.chips.map((chip, i) => (
                    <span
                      key={`${e.name}-${i}`}
                      className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="pt-2 font-mono text-[10px] text-muted-foreground/70">
            turn_id: {trace.turn_id.slice(0, 8)}…
          </div>
        </div>
      )}
    </div>
  );
}
