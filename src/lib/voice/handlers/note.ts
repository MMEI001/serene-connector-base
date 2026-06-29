import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "../types";

type Ctx = { supabase: SupabaseClient; userId: string };

export function previewNote(payload: Record<string, unknown>): ActionResult {
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : null;
  const content =
    typeof payload.text === "string" && payload.text.trim()
      ? payload.text.trim()
      : typeof payload.content === "string" && payload.content.trim()
        ? payload.content.trim()
        : title ?? "Notitie";

  const display = title ? `Notitie: ${title}` : `Notitie: ${content}`;

  return {
    intent: "note",
    status: "completed",
    confirmation: display,
    preview: display,
  };
}

export async function handleNote(
  ctx: Ctx,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : null;
  const content =
    typeof payload.text === "string" && payload.text.trim()
      ? payload.text.trim()
      : typeof payload.content === "string" && payload.content.trim()
        ? payload.content.trim()
        : title ?? "";

  if (!content && !title) {
    return {
      intent: "note",
      status: "skipped",
      confirmation: "Ik miste de inhoud om als notitie op te slaan.",
    };
  }

  const { data, error } = await ctx.supabase
    .from("notes")
    .insert({
      user_id: ctx.userId,
      title: title,
      content: content || title || "Notitie",
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      intent: "note",
      status: "failed",
      confirmation: "Ik kon je notitie op dit moment niet opslaan. Probeer het later nog eens.",
      error: error?.message ?? "insert failed",
    };
  }

  return {
    intent: "note",
    status: "completed",
    confirmation: "Ik heb het als notitie voor je opgeslagen.",
    ref: { table: "notes", id: data.id as string },
  };
}
