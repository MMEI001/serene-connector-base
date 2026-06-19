import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

// Fase B: sla op in `appointments`, status: 'needs_confirmation'.
export async function handleEvent(
  _ctx: Ctx,
  _payload: Record<string, unknown>,
): Promise<ActionResult> {
  return {
    intent: "event",
    status: "failed",
    confirmation: "Agenda-events via spraak komt binnenkort.",
    error: "not_implemented",
  };
}
