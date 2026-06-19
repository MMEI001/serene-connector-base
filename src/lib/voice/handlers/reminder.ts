import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

// Fase B: parse payload (when/what/who) en sla op in `reminders`,
// status: 'needs_confirmation' tot gebruiker bevestigt.
export async function handleReminder(
  _ctx: Ctx,
  _payload: Record<string, unknown>,
): Promise<ActionResult> {
  return {
    intent: "reminder",
    status: "failed",
    confirmation: "Reminders via spraak komt binnenkort.",
    error: "not_implemented",
  };
}
