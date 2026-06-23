import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

// Fase B-2: dedicated notes-tabel. Voor nu: stub.
export async function handleNote(
  _ctx: Ctx,
  _payload: Record<string, unknown>,
): Promise<ActionResult> {
  return {
    intent: "note",
    status: "failed",
    confirmation: "Notities via spraak komt binnenkort.",
    error: "not_implemented",
  };
}
