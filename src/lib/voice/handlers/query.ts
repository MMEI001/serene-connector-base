import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

// Fase B: lees agenda + reminders en geef rustige samenvatting (later TTS in fase C).
export async function handleQuery(
  _ctx: Ctx,
  _payload: Record<string, unknown>,
): Promise<ActionResult> {
  return {
    intent: "query",
    status: "failed",
    confirmation: "Vragen stellen aan de orb komt binnenkort.",
    error: "not_implemented",
  };
}
