/**
 * Feature flags voor de geleidelijke uitrol van het Intelligence Framework.
 *
 * - `off`        — alles via de bestaande runVoicePipeline (legacy).
 * - `chat_only`  — alleen assistant_chat zonder DB-acties via runAssistantTurn.
 * - `full`       — alle intents via runAssistantTurn (Sprint 4+).
 *
 * Server-only: nooit importeren in client-code. De keuze leeft op de server
 * zodat we hem zonder client-deploy kunnen omzetten.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantFrameworkMode = "off" | "chat_only" | "full";

function envDefault(): AssistantFrameworkMode {
  const raw = process.env.ASSISTANT_FRAMEWORK?.toLowerCase();
  if (raw === "off" || raw === "chat_only" || raw === "full") return raw;
  // Default: chat_only — laagste risico, hoogste leerwaarde.
  return "chat_only";
}

/**
 * Bepaal het actieve framework-modus voor deze user.
 * Per-user override via user_profiles.assistant_framework_mode (optioneel veld);
 * als dat veld niet bestaat of leeg is, valt het terug op de env-default.
 */
export async function resolveAssistantMode(
  supabase: SupabaseClient,
  userId: string,
): Promise<AssistantFrameworkMode> {
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("assistant_framework_mode")
      .eq("user_id", userId)
      .maybeSingle();
    const override = (data as { assistant_framework_mode?: string } | null)
      ?.assistant_framework_mode;
    if (override === "off" || override === "chat_only" || override === "full") {
      return override;
    }
  } catch {
    // Kolom bestaat (nog) niet — geen probleem, default gebruiken.
  }
  return envDefault();
}

/**
 * Mag deze turn door de nieuwe assistant-laag worden afgehandeld?
 * Sprint 2: alleen assistant_chat zonder DB-impacterende suggested_actions.
 * Sprint 4: een herkenbare Experience (bv. gift_event) loopt altijd door
 *   het framework, ook in chat_only-mode — de pipeline bouwt zelf het
 *   bevestigingsvoorstel.
 */
export function isEligibleForAssistantLayer(
  mode: AssistantFrameworkMode,
  primaryIntent: string,
  hasSuggestedActions: boolean,
  hasExperience = false,
): boolean {
  if (mode === "off") return false;
  if (mode === "full") return true;
  if (hasExperience && primaryIntent === "assistant_chat") return true;
  // chat_only: pure adviesreacties.
  return primaryIntent === "assistant_chat" && !hasSuggestedActions;
}
