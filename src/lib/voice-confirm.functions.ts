import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commitVoiceBundle } from "@/lib/voice/dispatch-voice-action";
import type { ActionResult, VoiceAction } from "@/lib/voice/types";

type Overrides = {
  title?: string;
  iso_datetime?: string;
  date?: string;
  start_time?: string;
};

const validateConfirm = (data: { action_id: string; overrides?: Overrides }) => {
  if (!data || typeof data.action_id !== "string" || !data.action_id) {
    throw new Error("action_id required");
  }
  const out: { action_id: string; overrides?: Overrides } = { action_id: data.action_id };
  const o = data.overrides;
  if (o && typeof o === "object") {
    const ov: Overrides = {};
    if (typeof o.title === "string") {
      const t = o.title.trim();
      if (t.length < 1 || t.length > 200) throw new Error("titel ongeldig");
      ov.title = t;
    }
    if (typeof o.iso_datetime === "string") {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(o.iso_datetime)) {
        throw new Error("iso_datetime ongeldig");
      }
      const t = new Date(o.iso_datetime).getTime();
      if (Number.isNaN(t)) throw new Error("iso_datetime onleesbaar");
      if (t < Date.now() - 60_000) throw new Error("tijd ligt in het verleden");
      ov.iso_datetime = o.iso_datetime;
    }
    if (typeof o.date === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) throw new Error("date ongeldig");
      ov.date = o.date;
    }
    if (typeof o.start_time === "string") {
      if (!/^\d{2}:\d{2}$/.test(o.start_time)) throw new Error("start_time ongeldig");
      ov.start_time = o.start_time;
    }
    if (Object.keys(ov).length > 0) out.overrides = ov;
  }
  return out;
};

const validateId = (data: { action_id: string }) => {
  if (!data || typeof data.action_id !== "string" || !data.action_id) {
    throw new Error("action_id required");
  }
  return { action_id: data.action_id };
};

export const confirmVoiceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateConfirm)
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("voice_actions")
      .select("id,intent,payload,status,expires_at")
      .eq("id", data.action_id)
      .eq("user_id", userId)
      .single();

    if (error || !row) {
      return {
        intent: "release",
        status: "failed",
        confirmation: "Deze bevestiging is niet meer geldig.",
        error: "not_found",
      };
    }
    if (row.status !== "needs_confirmation") {
      return {
        intent: row.intent as ActionResult["intent"],
        status: "failed",
        confirmation: "Deze actie is al verwerkt.",
        error: "already_handled",
      };
    }

    const payload = (row.payload as Record<string, unknown>) ?? {};
    let actions: VoiceAction[] = Array.isArray(
      (payload as { actions?: unknown }).actions,
    )
      ? ((payload as { actions: VoiceAction[] }).actions)
      : [
          {
            intent: row.intent as VoiceAction["intent"],
            payload,
            confidence: 1,
          },
        ];

    // Apply overrides to the first confirmable action.
    if (data.overrides && actions.length > 0) {
      const idx = actions.findIndex((a) => a.intent === "reminder" || a.intent === "event");
      if (idx >= 0) {
        actions = actions.map((a, i) =>
          i === idx ? { ...a, payload: { ...a.payload, ...data.overrides } } : a,
        );
      }
    }

    const result = await commitVoiceBundle({ supabase, userId }, actions);

    await supabase
      .from("voice_actions")
      .update({
        status: result.status === "completed" ? "completed" : "failed",
        result_table: result.ref?.table ?? null,
        result_id: result.ref?.id ?? null,
        error: result.error ?? null,
        confirmation_text: result.confirmation,
        expires_at: null,
        payload: { actions } as never,
      })
      .eq("id", row.id);

    return result;
  });

export const cancelVoiceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateId)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await supabase
      .from("voice_actions")
      .update({ status: "failed", error: "cancelled", expires_at: null })
      .eq("id", data.action_id)
      .eq("user_id", userId)
      .eq("status", "needs_confirmation");
    return { ok: true };
  });

type PendingEditable = {
  intent: "reminder" | "event";
  title: string;
  iso_datetime?: string;
  date?: string;
  start_time?: string;
};

function deriveEditable(payload: unknown): PendingEditable | undefined {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const actions = Array.isArray((root as { actions?: unknown }).actions)
    ? ((root as { actions: VoiceAction[] }).actions)
    : null;
  const candidate: { intent: string; payload: Record<string, unknown> } | null = actions && actions.length === 1
    ? { intent: actions[0].intent, payload: actions[0].payload ?? {} }
    : actions
      ? null
      : { intent: String(root.intent ?? ""), payload: root };
  if (!candidate) return undefined;
  const p = candidate.payload ?? {};
  if (candidate.intent === "reminder") {
    return {
      intent: "reminder",
      title: typeof p.title === "string" ? p.title : "",
      iso_datetime: typeof p.iso_datetime === "string" ? p.iso_datetime : undefined,
    };
  }
  if (candidate.intent === "event") {
    return {
      intent: "event",
      title: typeof p.title === "string" ? p.title : "",
      date: typeof p.date === "string" ? p.date : undefined,
      start_time: typeof p.start_time === "string" ? p.start_time : undefined,
    };
  }
  return undefined;
}

export const getPendingVoiceAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    action_id: string;
    intent: string;
    preview: string;
    expires_at: string;
    editable?: PendingEditable;
  } | null> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("voice_actions")
      .select("id,intent,confirmation_text,expires_at,payload")
      .eq("user_id", userId)
      .eq("status", "needs_confirmation")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    return {
      action_id: data.id as string,
      intent: data.intent as string,
      preview: (data.confirmation_text as string) ?? "",
      expires_at: data.expires_at as string,
      editable: deriveEditable((data as { payload?: unknown }).payload),
    };
  });
