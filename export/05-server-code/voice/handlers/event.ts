import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

export function previewEvent(payload: Record<string, unknown>): ActionResult {
  const action = typeof payload.action === "string" ? payload.action : "create";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const date = typeof payload.date === "string" ? payload.date : "";
  const start = typeof payload.start_time === "string" ? payload.start_time : "";

  if (action === "delete") {
    // Verwijderen blijft voor nu uit de spraak-flow; route 2 (read-only ICS).
    return {
      intent: "event",
      status: "failed",
      confirmation:
        "Afspraken verwijderen via spraak kan nog niet. Open je agenda-app om dit te doen.",
      error: "delete_not_supported",
    };
  }

  if (!title || !date) {
    return {
      intent: "event",
      status: "failed",
      confirmation: "Ik miste de datum of het onderwerp.",
      error: "missing_fields",
    };
  }
  const preview = `${formatDate(date)}${start ? ` ${start}` : ""} — ${title}`;
  return {
    intent: "event",
    status: "needs_confirmation",
    confirmation: `Afspraak ${preview} aanmaken?`,
    preview,
  };
}

export async function commitEvent(
  ctx: Ctx,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const date = typeof payload.date === "string" ? payload.date : "";
  const start = typeof payload.start_time === "string" ? payload.start_time : null;
  const end = typeof payload.end_time === "string" ? payload.end_time : null;
  const description =
    typeof payload.description === "string" ? payload.description : null;

  if (!title || !date) {
    return {
      intent: "event",
      status: "failed",
      confirmation: "Ik miste de datum of het onderwerp.",
      error: "missing_fields",
    };
  }

  const { data, error } = await ctx.supabase
    .from("appointments")
    .insert({
      user_id: ctx.userId,
      title,
      description,
      date,
      start_time: start,
      end_time: end,
      source: "confirmed_from_ai",
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      intent: "event",
      status: "failed",
      confirmation: "Kon de afspraak niet opslaan.",
      error: error?.message ?? "insert failed",
    };
  }

  return {
    intent: "event",
    status: "completed",
    confirmation: `Afspraak ${formatDate(date)}${start ? ` ${start}` : ""} gezet.`,
    ref: { table: "appointments", id: data.id as string },
  };
}

/** Behoud voor compat — pipeline routeert nu direct naar previewEvent. */
export async function handleEvent(
  ctx: Ctx,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  return previewEvent(payload);
}

function formatDate(d: string): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Amsterdam",
    }).format(new Date(`${d}T12:00:00`));
  } catch {
    return d;
  }
}
