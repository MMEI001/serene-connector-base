import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, VoiceAction } from "./types";
import { handleRelease } from "./handlers/release";
import { previewReminder, commitReminder } from "./handlers/reminder";
import { handleNote } from "./handlers/note";
import { previewEvent, commitEvent } from "./handlers/event";
import { handleQuery } from "./handlers/query";
import { handleCheckin } from "./handlers/checkin";

type Ctx = { supabase: SupabaseClient; userId: string };

/** Eerste-stap dispatcher: voor reminder/event-create bouwt 'm alleen een preview;
 *  release/query/note/checkin voeren direct uit. */
export async function dispatchVoiceAction(
  ctx: Ctx,
  action: VoiceAction,
): Promise<ActionResult> {
  switch (action.intent) {
    case "release":
      return handleRelease(ctx, action.payload);
    case "reminder":
      return previewReminder(action.payload);
    case "note":
      return handleNote(ctx, action.payload);
    case "event":
      return previewEvent(action.payload);
    case "query":
      return handleQuery(ctx, action.payload);
    case "checkin":
      return handleCheckin(ctx, action.payload);
  }
}

/** Tweede-stap: na "Bevestig"-tap, schrijf daadwerkelijk weg. */
export async function commitVoiceAction(
  ctx: Ctx,
  intent: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  switch (intent) {
    case "reminder":
      return commitReminder(ctx, payload);
    case "event":
      return commitEvent(ctx, payload);
    default:
      return {
        intent: "release",
        status: "failed",
        confirmation: "Deze actie heeft geen bevestiging nodig.",
        error: "no_commit_handler",
      };
  }
}
