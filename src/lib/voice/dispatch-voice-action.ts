import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, VoiceAction } from "./types";
import { handleRelease } from "./handlers/release";
import { handleReminder } from "./handlers/reminder";
import { handleNote } from "./handlers/note";
import { handleEvent } from "./handlers/event";
import { handleQuery } from "./handlers/query";
import { handleCheckin } from "./handlers/checkin";

type Ctx = { supabase: SupabaseClient; userId: string };

export async function dispatchVoiceAction(
  ctx: Ctx,
  action: VoiceAction,
): Promise<ActionResult> {
  switch (action.intent) {
    case "release":
      return handleRelease(ctx, action.payload);
    case "reminder":
      return handleReminder(ctx, action.payload);
    case "note":
      return handleNote(ctx, action.payload);
    case "event":
      return handleEvent(ctx, action.payload);
    case "query":
      return handleQuery(ctx, action.payload);
    case "checkin":
      return handleCheckin(ctx, action.payload);
  }
}
