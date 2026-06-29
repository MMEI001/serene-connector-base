/**
 * Server-side store voor één lopende Experience per gebruiker.
 *
 * Schrijft naar public.voice_experience_state. 15 minuten sliding window —
 * elke read/write verlengt expires_at. Gebruikt de auth-gemiddelde
 * supabase-client (RLS scoped op auth.uid()).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GiftEventInput } from "./gift-event";
import type { AskField } from "./continuation";

const WINDOW_MS = 15 * 60 * 1000;

export type ExperienceState = {
  kind: "gift_event";
  data: GiftEventInput;
  askedField: AskField | null;
  clarifyCount: number;
  /** Hoe oud (ms) was de state op het moment van lezen. null bij geen state. */
  ageMs: number | null;
};

export async function loadExperienceState(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<ExperienceState | null> {
  const { data, error } = await supabase
    .from("voice_experience_state")
    .select("kind,data,asked_field,clarify_count,updated_at,expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[experience-state] load failed", error.message);
    return null;
  }
  if (!data) return null;
  const expires = data.expires_at ? new Date(data.expires_at) : null;
  if (!expires || expires.getTime() < now.getTime()) return null;
  const updated = data.updated_at ? new Date(data.updated_at) : null;
  return {
    kind: data.kind as "gift_event",
    data: (data.data ?? {}) as GiftEventInput,
    askedField: (data.asked_field as AskField | null) ?? null,
    clarifyCount: typeof data.clarify_count === "number" ? data.clarify_count : 0,
    ageMs: updated ? Math.max(0, now.getTime() - updated.getTime()) : null,
  };
}

export async function saveExperienceState(
  supabase: SupabaseClient,
  userId: string,
  patch: {
    kind: "gift_event";
    data: GiftEventInput;
    askedField: AskField | null;
    clarifyCount: number;
  },
  now: Date,
): Promise<void> {
  const expiresAt = new Date(now.getTime() + WINDOW_MS).toISOString();
  const { error } = await supabase
    .from("voice_experience_state")
    .upsert(
      {
        user_id: userId,
        kind: patch.kind,
        data: patch.data as never,
        asked_field: patch.askedField,
        clarify_count: patch.clarifyCount,
        updated_at: now.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: "user_id" },
    );
  if (error) console.warn("[experience-state] save failed", error.message);
}

export async function clearExperienceState(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("voice_experience_state")
    .delete()
    .eq("user_id", userId);
  if (error) console.warn("[experience-state] clear failed", error.message);
}
