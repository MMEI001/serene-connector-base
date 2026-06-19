import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

// Fase D: proactieve check-in momenten.
export async function handleCheckin(
  _ctx: Ctx,
  _payload: Record<string, unknown>,
): Promise<ActionResult> {
  return {
    intent: "checkin",
    status: "failed",
    confirmation: "Check-ins komt binnenkort.",
    error: "not_implemented",
  };
}
