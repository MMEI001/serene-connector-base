import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

export async function handleRelease(
  ctx: Ctx,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return {
      intent: "release",
      status: "skipped",
      confirmation: "",
    };
  }

  const { data, error } = await ctx.supabase
    .from("let_go_items")
    .insert({ user_id: ctx.userId, content: text, status: "active" })
    .select("id")
    .single();

  if (error || !data) {
    return {
      intent: "release",
      status: "failed",
      confirmation: "Kon het niet opslaan. Probeer opnieuw.",
      error: error?.message ?? "insert failed",
    };
  }

  return {
    intent: "release",
    status: "completed",
    confirmation: "Losgelaten.",
    ref: { table: "let_go_items", id: data.id as string },
  };
}
