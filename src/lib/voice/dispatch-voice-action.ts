import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, ActionPreview, VoiceAction, VoiceIntent } from "./types";
import type { UserPersona } from "./persona";
import { handleRelease } from "./handlers/release";
import { previewReminder, commitReminder } from "./handlers/reminder";
import { handleNote } from "./handlers/note";
import { previewEvent, commitEvent } from "./handlers/event";
import { handleQuery } from "./handlers/query";
import { handleCheckin } from "./handlers/checkin";

type Ctx = { supabase: SupabaseClient; userId: string; persona?: UserPersona };

const CONFIRM_INTENTS = new Set<VoiceIntent>(["reminder", "event"]);

/**
 * Dispatch een (mogelijk samengestelde) lijst van voice-acties.
 * - Bevat de bundle alleen non-confirm intents (release/query/note/checkin)
 *   → voer de eerste uit en geef dat resultaat terug. (We mixen niet — een
 *   release + reminder in één zin is zeldzaam; het model splitst dat zelden.)
 * - Bevat de bundle één of meer reminder/event acties → bouw previews voor
 *   het hele pakket en geef needs_confirmation terug.
 */
export async function dispatchVoiceBundle(
  ctx: Ctx,
  actions: VoiceAction[],
): Promise<ActionResult> {
  const confirmable = actions.filter((a) => CONFIRM_INTENTS.has(a.intent));

  if (confirmable.length === 0) {
    // Geen bevestiging nodig — voer de eerste relevante actie direct uit.
    return dispatchSingle(ctx, actions[0]);
  }

  // Bouw previews voor alle bevestigingsacties.
  const previews: ActionPreview[] = [];
  for (const a of confirmable) {
    const r = a.intent === "event" ? previewEvent(a.payload) : previewReminder(a.payload);
    if (r.status === "failed") {
      // Eén van de acties miste verplichte velden → val terug op een failed bundle.
      return r;
    }
    previews.push({ intent: a.intent, preview: r.preview ?? r.confirmation });
  }

  const previewText = previews.map((p) => `• ${p.preview}`).join("\n");
  const intro =
    previews.length > 1
      ? `${previews.length} acties klaar — klopt dit?`
      : previews[0].preview;

  return {
    intent: previews[0].intent,
    status: "needs_confirmation",
    confirmation: intro,
    preview: previewText,
    previews,
  };
}

async function dispatchSingle(ctx: Ctx, action: VoiceAction): Promise<ActionResult> {
  switch (action.intent) {
    case "release":
      return handleRelease(ctx, action.payload);
    case "note":
      return handleNote(ctx, action.payload);
    case "query":
      return handleQuery(ctx, action.payload);
    case "checkin":
      return handleCheckin(ctx, action.payload);
    case "reminder":
      return previewReminder(action.payload);
    case "event":
      return previewEvent(action.payload);
  }
}

/**
 * Commit een eerder gepreviewd pakket.
 * Volgorde: events eerst (zodat reminders met related_to_index naar de
 * net-aangemaakte appointment.id kunnen verwijzen), daarna reminders.
 * Atomisch in app-zin: bij een fout halverwege rollen we eerdere inserts terug.
 */
export async function commitVoiceBundle(
  ctx: Ctx,
  actions: VoiceAction[],
): Promise<ActionResult> {
  const sorted = [...actions]
    .map((a, i) => ({ a, originalIndex: i }))
    .sort((x, y) => (x.a.intent === "event" ? -1 : 1) - (y.a.intent === "event" ? -1 : 1));

  const created: Array<{ table: "appointments" | "reminders"; id: string; originalIndex: number }> = [];
  const results: ActionResult[] = [];

  try {
    for (const { a, originalIndex } of sorted) {
      let r: ActionResult;
      if (a.intent === "event") {
        r = await commitEvent(ctx, a.payload);
      } else if (a.intent === "reminder") {
        // Resolve related_appointment_id via related_to_index.
        const idx = typeof a.payload.related_to_index === "number" ? a.payload.related_to_index : null;
        let relatedId: string | null = null;
        if (idx != null) {
          const evt = created.find(
            (c) => c.table === "appointments" && c.originalIndex === idx,
          );
          if (evt) relatedId = evt.id;
        }
        const payload = relatedId
          ? { ...a.payload, related_appointment_id: relatedId }
          : a.payload;
        r = await commitReminder(ctx, payload);
      } else {
        continue;
      }

      if (r.status !== "completed" || !r.ref) {
        await rollback(ctx, created);
        return {
          intent: a.intent,
          status: "failed",
          confirmation:
            created.length > 0
              ? "Een onderdeel ging mis. Niets is opgeslagen."
              : r.confirmation,
          error: r.error ?? "commit_failed",
        };
      }
      created.push({ table: r.ref.table as "appointments" | "reminders", id: r.ref.id, originalIndex });
      results.push(r);
    }
  } catch (err) {
    await rollback(ctx, created);
    return {
      intent: actions[0]?.intent ?? "release",
      status: "failed",
      confirmation: "Er ging iets mis. Niets is opgeslagen.",
      error: err instanceof Error ? err.message : "commit_exception",
    };
  }

  if (results.length === 1) return results[0];

  const last = results[results.length - 1];
  return {
    intent: results[0].intent,
    status: "completed",
    confirmation: `${results.length} acties opgeslagen.`,
    ref: last.ref,
  };
}

async function rollback(
  ctx: Ctx,
  created: Array<{ table: "appointments" | "reminders"; id: string }>,
) {
  for (const c of [...created].reverse()) {
    await ctx.supabase
      .from(c.table)
      .delete()
      .eq("id", c.id)
      .eq("user_id", ctx.userId)
      .then(({ error }) => {
        if (error) console.error("[rollback]", c.table, c.id, error);
      });
  }
}

// ---- Backwards compat (oude single-action API) ----
export async function dispatchVoiceAction(
  ctx: Ctx,
  action: VoiceAction,
): Promise<ActionResult> {
  return dispatchVoiceBundle(ctx, [action]);
}

export async function commitVoiceAction(
  ctx: Ctx,
  _intent: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  // Nieuwe shape: payload bevat actions[]. Oude shape: één enkel intent+payload.
  const actions = Array.isArray((payload as { actions?: unknown }).actions)
    ? ((payload as { actions: VoiceAction[] }).actions)
    : [{ intent: _intent as VoiceIntent, payload, confidence: 1 }];
  return commitVoiceBundle(ctx, actions);
}
