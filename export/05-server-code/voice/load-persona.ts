import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUserPersona, type UserPersona, type UserProfileLike } from "./persona";

/**
 * Laadt het meest recente user_profile en bouwt er een UserPersona van.
 * Bedoeld om aangeroepen te worden binnen een server function (RLS actief
 * als de huidige gebruiker), zodat we de service-role niet hoeven te lekken.
 */
export async function loadUserPersona(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPersona> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "primary_goal, support_style, overstimulation_level, suggestion_count_preference, preferred_help_area, reminder_style, planning_style",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[persona] kon profile niet laden:", error.message);
    return buildUserPersona(null);
  }
  return buildUserPersona((data ?? null) as UserProfileLike);
}
