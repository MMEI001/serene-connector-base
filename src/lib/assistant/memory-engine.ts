/**
 * Memory Engine — voorkeuren, gewoontes en context die de gebruiker later
 * beter helpen. Sprint 1: statische persona uit user_profiles + stub voor
 * write-back. Later sprint: assistant_memory tabel met dynamisch leren.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserPersona } from "@/lib/voice/load-persona";
import type { UserPersona } from "@/lib/voice/persona";
import type { Conversation, MemoryHit } from "./types";

export async function recall(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ persona: UserPersona; hits: MemoryHit[] }> {
  const persona = await loadUserPersona(supabase, userId);
  // Sprint 1: geen dynamische memory-hits. Plaatshouder voor later.
  return { persona, hits: [] };
}

/**
 * Schrijf alleen weg wat de gebruiker later beter helpt.
 * Sprint 1: no-op met log, zodat call-sites alvast goed staan.
 */
export async function remember(
  _supabase: SupabaseClient,
  _userId: string,
  _conversation: Conversation,
): Promise<void> {
  // TODO(sprint-2): selectief leren — geen ruwe transcripts, alleen
  //   gedistilleerde voorkeuren (bv. "default cadeau-budget: 25€").
}
