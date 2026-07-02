/**
 * VoicePlaybackService — minimale, betrouwbare TTS-playback.
 *
 * Doel (bewust simpel): één audio tegelijk, één duidelijke levenscyclus.
 * Geen acknowledgement, geen dubbele engines, geen generation-tokens,
 * geen autoplay-trucs, geen speechSynthesis fallback (behalve als het
 * expliciet nodig is na een echte TTS failure).
 *
 * State machine (via caller/orb):
 *   idle → listening → processing → speaking → idle/listening
 * De "speaking" state eindigt PAS bij audio.onended of audio.onerror.
 *
 * Legacy exports (playAcknowledgement / stopAcknowledgement /
 * prewarmVoiceCache / subscribeVoiceTrace) zijn no-ops zodat bestaande
 * imports blijven werken zonder gedrag toe te voegen.
 */

import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte
export const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export type VoiceSpeakOptions = {
  intent?: string;
  route?: string;
  force?: boolean;
  voiceId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  /** Legacy — genegeerd, maar toegestaan zodat callsites niet breken. */
  isAck?: boolean;
  preloadOnly?: boolean;
};

export type VoiceTraceLog = {
  provider: string;
  voice_id: string;
  model: string;
  route: string;
  latency_ms: number;
  intent: string;
  text_preview: string;
  source?: "network" | "cache" | "preload" | "browser" | "error";
  status?: string;
  timestamp: string;
};

// -------------------------------------------------------------------
// Voorkeuren-cache (voice_enabled + voice_id per user)
// -------------------------------------------------------------------

let cachedEnabled: boolean | null = null;
let cachedVoiceId: string | null = null;
let cachedProvider: string | null = null;

let authListenerAttached = false;
function ensureAuthListener() {
  if (authListenerAttached || typeof window === "undefined") return;
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        resetVoicePreferenceCache();
      }
    });
    authListenerAttached = true;
  } catch {
    // ignore
  }
}

export function resetVoicePreferenceCache() {
  cachedEnabled = null;
  cachedVoiceId = null;
  cachedProvider = null;
}

export function setVoicePreferenceCache(enabled: boolean) {
  cachedEnabled = enabled;
}

export function setVoiceIdCache(voiceId: string) {
  cachedVoiceId = voiceId;
}

export async function loadVoicePrefs(): Promise<{
  enabled: boolean;
  voiceId: string;
  provider: string;
}> {
  ensureAuthListener();
  if (cachedEnabled !== null && cachedVoiceId !== null && cachedProvider !== null) {
    return { enabled: cachedEnabled, voiceId: cachedVoiceId, provider: cachedProvider };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    return { enabled: false, voiceId: DEFAULT_VOICE_ID, provider: "elevenlabs" };
  }
  const { data, error } = await supabase
    .from("user_profiles")
    .select("voice_enabled, voice_provider, voice_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return { enabled: false, voiceId: DEFAULT_VOICE_ID, provider: "elevenlabs" };
  }
  const row = data as {
    voice_enabled?: boolean | null;
    voice_provider?: string | null;
    voice_id?: string | null;
  };
  const enabled = Boolean(row.voice_enabled);
  const provider = row.voice_provider || "elevenlabs";
  const voiceId = row.voice_id || DEFAULT_VOICE_ID;
  cachedEnabled = enabled;
  cachedVoiceId = voiceId;
  cachedProvider = provider;
  return { enabled, voiceId, provider };
}

// -------------------------------------------------------------------
// Trace listeners (voor debug-badge in orb)
// -------------------------------------------------------------------

let lastTraceLog: VoiceTraceLog | null = null;
const traceListeners = new Set<(trace: VoiceTraceLog) => void>();

function emitTrace(log: VoiceTraceLog) {
  lastTraceLog = log;
  traceListeners.forEach((fn) => {
    try {
      fn(log);
    } catch {
      // ignore
    }
  });
}

export function getVoiceTrace(): VoiceTraceLog | null {
  return lastTraceLog;
}

export function subscribeVoiceTrace(fn: (trace: VoiceTraceLog) => void): () => void {
  traceListeners.add(fn);
  if (lastTraceLog) fn(lastTraceLog);
  return () => {
    traceListeners.delete(fn);
  };
}

// -------------------------------------------------------------------
// Playback — één audio tegelijk
// -------------------------------------------------------------------

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopVoice(_route?: string) {
  if (!currentAudio) return;
  try {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.onplaying = null;
    currentAudio.pause();
  } catch {
    // ignore
  }
  if (currentUrl && currentUrl.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      // ignore
    }
  }
  currentAudio = null;
  currentUrl = null;
}

/**
 * Centrale speak: fetch TTS blob, speel af, resolve na onended/onerror.
 * Nooit twee audio-elementen tegelijk.
 */
export async function speak(
  text: string,
  options: VoiceSpeakOptions = {},
): Promise<void> {
  const cleanText = text?.trim() ?? "";
  const intent = options.intent ?? "general";
  const route = options.route ?? intent;

  console.log("[VOICE NEW] speak start", { route, intent });
  console.log("[VOICE NEW] text length", cleanText.length);

  if (!cleanText) return;
  if (options.preloadOnly) return; // legacy — no-op

  const prefs = await loadVoicePrefs();
  const enabled = options.force ? true : prefs.enabled;
  if (!enabled) {
    console.log("[VOICE NEW] disabled in profile — skip");
    return;
  }
  const voiceId = options.voiceId ?? prefs.voiceId;

  const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : "");
  const ANON =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : "");
  if (!SUPABASE_URL || !ANON) {
    console.error("[VOICE NEW] supabase config missing");
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? ANON;

  // Stop wat er nog draait vóór we een nieuwe fetch starten — één audio tegelijk.
  stopVoice();

  const t0 = performance.now();
  console.log("[VOICE NEW] tts request", { voiceId });
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: cleanText, voice_id: voiceId }),
    });
  } catch (err) {
    console.error("[VOICE NEW] tts fetch failed", err);
    emitTrace({
      provider: "elevenlabs",
      voice_id: voiceId,
      model: DEFAULT_MODEL_ID,
      route,
      latency_ms: Math.round(performance.now() - t0),
      intent,
      text_preview: cleanText.slice(0, 40),
      source: "error",
      status: "network_error",
      timestamp: new Date().toISOString(),
    });
    return;
  }
  console.log("[VOICE NEW] tts response status", res.status);

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || contentType.includes("application/json")) {
    console.error("[VOICE NEW] tts non-audio response", res.status, contentType);
    emitTrace({
      provider: "elevenlabs",
      voice_id: voiceId,
      model: DEFAULT_MODEL_ID,
      route,
      latency_ms: Math.round(performance.now() - t0),
      intent,
      text_preview: cleanText.slice(0, 40),
      source: "error",
      status: `http_${res.status}`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const blob = await res.blob();
  console.log("[VOICE NEW] blob size", blob.size);

  emitTrace({
    provider: "elevenlabs",
    voice_id: res.headers.get("x-voice-id") || voiceId,
    model: res.headers.get("x-voice-model") || DEFAULT_MODEL_ID,
    route,
    latency_ms: Math.round(performance.now() - t0),
    intent,
    text_preview: cleanText.slice(0, 40),
    source: "network",
    timestamp: new Date().toISOString(),
  });

  await playBlob(blob, options);
}

function playBlob(blob: Blob, options: VoiceSpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "auto";
    // iOS Safari: inline playback in plaats van fullscreen.
    // @ts-expect-error playsInline bestaat op HTMLAudioElement in iOS Safari
    audio.playsInline = true;
    audio.setAttribute("playsinline", "true");
    audio.src = url;

    currentAudio = audio;
    currentUrl = url;

    let settled = false;
    const finish = (reason: "ended" | "error" | "rejected") => {
      if (settled) return;
      settled = true;
      if (reason === "ended") console.log("[VOICE NEW] audio ended");
      else console.log("[VOICE NEW] audio error", { reason });
      if (currentAudio === audio) {
        currentAudio = null;
        currentUrl = null;
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      try {
        options.onEnd?.();
      } catch {
        // ignore
      }
      resolve();
    };

    audio.onplaying = () => {
      console.log("[VOICE NEW] audio playing");
      try {
        options.onStart?.();
      } catch {
        // ignore
      }
    };
    audio.onended = () => finish("ended");
    audio.onerror = () => finish("error");

    console.log("[VOICE NEW] audio play called");
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.catch((err) => {
        console.error("[VOICE NEW] audio error", { name: err?.name, message: err?.message });
        finish("rejected");
      });
    }
  });
}

// -------------------------------------------------------------------
// Legacy no-ops — behouden zodat bestaande imports blijven werken.
// Bewust géén acknowledgement of prewarm.
// -------------------------------------------------------------------

export async function prewarmVoiceCache(): Promise<void> {
  // no-op
}

export function playAcknowledgement(): () => void {
  return () => {};
}

export function stopAcknowledgement(): void {
  // no-op
}
