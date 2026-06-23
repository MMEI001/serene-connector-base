import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

/** Bouw preview-tekst voor de bevestigingsstap. */
export function previewReminder(payload: Record<string, unknown>): ActionResult {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const iso = typeof payload.iso_datetime === "string" ? payload.iso_datetime : "";
  if (!title || !iso) {
    return {
      intent: "reminder",
      status: "failed",
      confirmation: "Ik miste de tijd of het onderwerp.",
      error: "missing_fields",
    };
  }
  const when = formatWhen(iso);
  return {
    intent: "reminder",
    status: "needs_confirmation",
    confirmation: `Reminder ${when}: ${title}.`,
    preview: `${when} — ${title}`,
  };
}

/** Schrijft de reminder na bevestiging. */
export async function commitReminder(
  ctx: Ctx,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const iso = typeof payload.iso_datetime === "string" ? payload.iso_datetime : "";
  const description =
    typeof payload.description === "string" ? payload.description : null;
  const relatedAppointmentId =
    typeof payload.related_appointment_id === "string"
      ? payload.related_appointment_id
      : null;
  if (!title || !iso) {
    return {
      intent: "reminder",
      status: "failed",
      confirmation: "Ik miste de tijd of het onderwerp.",
      error: "missing_fields",
    };
  }

  const insertRow: Record<string, unknown> = {
    user_id: ctx.userId,
    title,
    description,
    remind_at: iso,
    status: "active",
    source: "confirmed_from_ai",
  };
  if (relatedAppointmentId) insertRow.related_appointment_id = relatedAppointmentId;

  const { data, error } = await ctx.supabase
    .from("reminders")
    .insert(insertRow as never)
    .select("id")
    .single();

  if (error || !data) {
    return {
      intent: "reminder",
      status: "failed",
      confirmation: "Kon de reminder niet opslaan.",
      error: error?.message ?? "insert failed",
    };
  }

  return {
    intent: "reminder",
    status: "completed",
    confirmation: `Reminder ${formatWhen(iso)} gezet.`,
    ref: { table: "reminders", id: data.id as string },
  };
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam",
    }).format(d);
  } catch {
    return iso;
  }
}
