import { supabase } from "@/integrations/supabase/client";

let cachedEnabled: boolean | null = null;
let currentAudio: HTMLAudioElement | null = null;

export function resetVoicePreferenceCache() {
  cachedEnabled = null;
}

export function setVoicePreferenceCache(enabled: boolean) {
  cachedEnabled = enabled;
}

async function getVoiceEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return false;
  const { data } = await supabase
    .from("user_profiles")
    .select("voice_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  // voice_enabled column may not yet be in generated types
  const enabled = Boolean((data as { voice_enabled?: boolean } | null)?.voice_enabled);
  cachedEnabled = enabled;
  return enabled;
}

export async function speakText(text: string, opts?: { force?: boolean }): Promise<void> {
  try {
    if (!text || !text.trim()) return;
    if (!opts?.force) {
      const enabled = await getVoiceEnabled();
      if (!enabled) return;
    }

    const SUPABASE_URL =
      import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : "");
    const ANON =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : "");
    if (!SUPABASE_URL || !ANON) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? ANON;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn("[speakText] edge function returned", res.status);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // ignore
      }
    }
    const audio = new Audio(url);
    currentAudio = audio;
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    audio.addEventListener("error", () => URL.revokeObjectURL(url));
    try {
      await audio.play();
    } catch (err) {
      // Autoplay can be blocked (esp. iOS Safari) when not triggered by user gesture
      console.warn("[speakText] playback blocked", err);
    }
  } catch (err) {
    console.warn("[speakText] failed", err);
  }
}
