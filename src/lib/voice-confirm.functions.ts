import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commitVoiceBundle } from "@/lib/voice/dispatch-voice-action";
import type { ActionResult, VoiceAction } from "@/lib/voice/types";

const validateId = (data: { action_id: string }) => {
  if (!data || typeof data.action_id !== "string" || !data.action_id) {
    throw new Error("action_id required");
  }
  return { action_id: data.action_id };
};

export const confirmVoiceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateId)
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
    const actions: VoiceAction[] = Array.isArray(
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

export const getPendingVoiceAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    action_id: string;
    intent: string;
    preview: string;
    expires_at: string;
  } | null> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("voice_actions")
      .select("id,intent,confirmation_text,expires_at")
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
    };
  });
