import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

export async function handleCheckin(
  _ctx: Ctx,
  _payload: Record<string, unknown>,
): Promise<ActionResult> {
  return {
    intent: "checkin",
    status: "completed",
    confirmation:
      "Ik kan op dit moment nog geen automatische check-in momenten voor je inplannen, maar ik luister graag naar je. Vertel eens, hoe voel je je nu?",
  };
}
