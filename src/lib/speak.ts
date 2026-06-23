import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte

let cachedEnabled: boolean | null = null;
let cachedVoiceId: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
let ttsUnavailableUntil = 0; // epoch ms; skip ElevenLabs until then

function browserSpeak(text: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "nl-NL";
    utter.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

export function resetVoicePreferenceCache() {
  cachedEnabled = null;
  cachedVoiceId = null;
}

export function setVoicePreferenceCache(enabled: boolean) {
  cachedEnabled = enabled;
}

export function setVoiceIdCache(voiceId: string) {
  cachedVoiceId = voiceId;
}

async function loadPrefs(): Promise<{ enabled: boolean; voiceId: string }> {
  if (cachedEnabled !== null && cachedVoiceId !== null) {
    return { enabled: cachedEnabled, voiceId: cachedVoiceId };
  }
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { enabled: false, voiceId: DEFAULT_VOICE_ID };
  const { data } = await supabase
    .from("user_profiles")
    .select("voice_enabled, voice_id" as "*")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { voice_enabled?: boolean; voice_id?: string } | null;
  const enabled = Boolean(row?.voice_enabled);
  const voiceId = row?.voice_id || DEFAULT_VOICE_ID;
  cachedEnabled = enabled;
  cachedVoiceId = voiceId;
  return { enabled, voiceId };
}

export async function speakText(
  text: string,
  opts?: { force?: boolean; voiceId?: string },
): Promise<void> {
  try {
    if (!text || !text.trim()) return;

    let voiceId = opts?.voiceId ?? DEFAULT_VOICE_ID;
    if (!opts?.voiceId) {
      const prefs = await loadPrefs();
      if (!opts?.force && !prefs.enabled) return;
      voiceId = prefs.voiceId;
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

    // Skip ElevenLabs entirely during cooldown after a known failure.
    if (Date.now() < ttsUnavailableUntil) {
      browserSpeak(text);
      return;
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, voice_id: voiceId }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || contentType.includes("application/json")) {
      // Either an error, or a JSON fallback signal from the edge function.
      let fallback = true;
      try {
        const payload = await res.json();
        fallback = payload?.fallback !== false;
      } catch {
        // non-JSON failure: still fall back
      }
      if (!res.ok) console.warn("[speakText] edge function returned", res.status);
      if (fallback) {
        // Cool down for 5 min so we don't hammer ElevenLabs while it's down/unpaid.
        ttsUnavailableUntil = Date.now() + 5 * 60 * 1000;
        browserSpeak(text);
      }
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
      console.warn("[speakText] playback blocked", err);
    }
  } catch (err) {
    console.warn("[speakText] failed", err);
  }
}
