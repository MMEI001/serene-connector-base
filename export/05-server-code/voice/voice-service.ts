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

// Tijdelijk: Sarah als default totdat Charlotte bewezen werkt op dit ElevenLabs-account.
// Charlotte ("XB0fDUnXU5powFXDhCwa") is niet gegarandeerd beschikbaar op elk account
// en gaf non-audio responses terug — we forceren hem niet meer hard.
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah (bekende publieke stem)
export const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
export type VoiceQuality = "fast" | "natural";
export const DEFAULT_VOICE_QUALITY: VoiceQuality = "fast";

export type VoiceSpeakOptions = {
  intent?: string;
  route?: string;
  force?: boolean;
  voiceId?: string;
  quality?: VoiceQuality;
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
let cachedQuality: VoiceQuality | null = null;

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
  cachedQuality = null;
}

export function setVoicePreferenceCache(enabled: boolean) {
  cachedEnabled = enabled;
}

export function setVoiceIdCache(voiceId: string) {
  cachedVoiceId = voiceId;
}

export function setVoiceQualityCache(quality: VoiceQuality) {
  cachedQuality = quality;
}

export async function loadVoicePrefs(): Promise<{
  enabled: boolean;
  voiceId: string;
  provider: string;
  quality: VoiceQuality;
}> {
  ensureAuthListener();
  if (
    cachedEnabled !== null &&
    cachedVoiceId !== null &&
    cachedProvider !== null &&
    cachedQuality !== null
  ) {
    return {
      enabled: cachedEnabled,
      voiceId: cachedVoiceId,
      provider: cachedProvider,
      quality: cachedQuality,
    };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    return {
      enabled: false,
      voiceId: DEFAULT_VOICE_ID,
      provider: "elevenlabs",
      quality: DEFAULT_VOICE_QUALITY,
    };
  }
  const { data, error } = await supabase
    .from("user_profiles")
    .select("voice_enabled, voice_provider, voice_id, voice_quality" as "*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return {
      enabled: false,
      voiceId: DEFAULT_VOICE_ID,
      provider: "elevenlabs",
      quality: DEFAULT_VOICE_QUALITY,
    };
  }
  const row = data as {
    voice_enabled?: boolean | null;
    voice_provider?: string | null;
    voice_id?: string | null;
    voice_quality?: string | null;
  };
  const enabled = Boolean(row.voice_enabled);
  const provider = row.voice_provider || "elevenlabs";
  const voiceId = row.voice_id || DEFAULT_VOICE_ID;
  const quality: VoiceQuality =
    row.voice_quality === "natural" ? "natural" : DEFAULT_VOICE_QUALITY;
  cachedEnabled = enabled;
  cachedVoiceId = voiceId;
  cachedProvider = provider;
  cachedQuality = quality;
  return { enabled, voiceId, provider, quality };
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

// Eén gedeelde HTMLAudioElement — identiek aan /audio-diagnostics. Op iOS
// mag je géén nieuw <audio> per call maken buiten de user-gesture context.
let sharedAudio: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (sharedAudio) return sharedAudio;
  const el = new Audio();
  el.preload = "auto";
  // @ts-expect-error iOS Safari
  el.playsInline = true;
  el.setAttribute("playsinline", "true");
  sharedAudio = el;
  return el;
}

export function stopVoice(_route?: string) {
  const el = sharedAudio;
  if (!el) return;
  try {
    el.onended = null;
    el.onerror = null;
    el.onplaying = null;
    el.onpause = null;
    el.pause();
  } catch {
    // ignore
  }
  if (currentBlobUrl && currentBlobUrl.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(currentBlobUrl);
    } catch {
      // ignore
    }
  }
  currentBlobUrl = null;
}

/**
 * Centrale speak: 1-op-1 dezelfde flow als /audio-diagnostics test 3.
 * - Één gedeelde HTMLAudioElement (nooit new Audio() per call).
 * - fetch → blob → objectURL → play.
 * - Resolve pas na audio.onended / onerror / play-rejection.
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
  if (options.preloadOnly) return;

  const prefs = await loadVoicePrefs();
  const enabled = options.force ? true : prefs.enabled;
  if (!enabled) {
    console.log("[VOICE NEW] disabled in profile — skip");
    return;
  }
  const voiceId = options.voiceId ?? prefs.voiceId;
  const quality: VoiceQuality = options.quality ?? prefs.quality;
  const modelId = quality === "natural" ? "eleven_multilingual_v2" : "eleven_flash_v2_5";

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

  // Stop wat er nog draait vóór we een nieuwe fetch starten.
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
      body: JSON.stringify({ text: cleanText, voice_id: voiceId, model_id: modelId }),
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

  await playStreaming(res, options);
}

// Progressief afspelen via MediaSource: audio begint zodra de eerste MP3-chunk
// binnen is, in plaats van te wachten op de volledige blob. Valt terug op de
// blob-flow als MediaSource niet beschikbaar is (bijv. oudere iOS-versies).
async function playStreaming(res: Response, options: VoiceSpeakOptions): Promise<void> {
  const body = res.body;
  const MSource: typeof MediaSource | undefined =
    (typeof window !== "undefined" &&
      // @ts-expect-error iOS 17.1+
      (window.ManagedMediaSource as typeof MediaSource | undefined)) ||
    (typeof window !== "undefined" ? window.MediaSource : undefined);

  if (!body || !MSource || !MSource.isTypeSupported?.("audio/mpeg")) {
    const blob = await res.blob();
    console.log("[VOICE NEW] blob fallback size", blob.size);
    return playBlob(blob, options);
  }

  return new Promise((resolve) => {
    const el = getSharedAudio();
    (el as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
    const ms = new MSource();
    const url = URL.createObjectURL(ms);

    // Reset & vrijgeven vorige blob-url.
    el.onended = null;
    el.onerror = null;
    el.onplaying = null;
    el.onpause = null;
    if (currentBlobUrl && currentBlobUrl.startsWith("blob:")) {
      try { URL.revokeObjectURL(currentBlobUrl); } catch { /* ignore */ }
    }
    currentBlobUrl = url;
    el.src = url;

    let settled = false;
    const finish = (reason: "ended" | "error" | "rejected") => {
      if (settled) return;
      settled = true;
      console.log("[VOICE NEW] stream", reason);
      if (currentBlobUrl === url) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        currentBlobUrl = null;
      }
      try { options.onEnd?.(); } catch { /* ignore */ }
      resolve();
    };

    el.onplaying = () => {
      console.log("[VOICE NEW] stream playing");
      try { options.onStart?.(); } catch { /* ignore */ }
    };
    el.onended = () => finish("ended");
    el.onerror = () => finish("error");

    ms.addEventListener("sourceopen", async () => {
      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer("audio/mpeg");
      } catch (err) {
        console.error("[VOICE NEW] addSourceBuffer failed", err);
        finish("error");
        return;
      }

      const reader = body.getReader();
      const queue: Uint8Array[] = [];
      let done = false;
      let appending = false;

      const pump = () => {
        if (appending || queue.length === 0 || sb.updating) return;
        appending = true;
        try {
          const chunk = queue.shift()!;
          sb.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
        } catch (err) {
          console.error("[VOICE NEW] appendBuffer error", err);
          appending = false;
        }
      };

      sb.addEventListener("updateend", () => {
        appending = false;
        if (queue.length > 0) {
          pump();
        } else if (done) {
          try { ms.endOfStream(); } catch { /* ignore */ }
        }
      });

      // Autoplay direct triggeren; browsers wachten anders op canplay.
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.catch((err) => {
          console.error("[VOICE NEW] stream play rejected", err?.name, err?.message);
          finish("rejected");
        });
      }

      try {
        while (true) {
          const { value, done: rdone } = await reader.read();
          if (rdone) break;
          if (value && value.byteLength > 0) {
            queue.push(value);
            pump();
          }
        }
        done = true;
        if (queue.length === 0 && !sb.updating) {
          try { ms.endOfStream(); } catch { /* ignore */ }
        }
      } catch (err) {
        console.error("[VOICE NEW] stream read error", err);
        try { ms.endOfStream("network" as EndOfStreamError); } catch { /* ignore */ }
      }
    }, { once: true });
  });
}

function playBlob(blob: Blob, options: VoiceSpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = getSharedAudio();

    // Reset listeners van vorige call.
    el.onended = null;
    el.onerror = null;
    el.onplaying = null;
    el.onpause = null;

    // Vrijgeven van oude blob-URL indien nog aanwezig.
    if (currentBlobUrl && currentBlobUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(currentBlobUrl);
      } catch {
        // ignore
      }
    }
    currentBlobUrl = url;
    el.src = url;

    let settled = false;
    const finish = (reason: "ended" | "error" | "rejected") => {
      if (settled) return;
      settled = true;
      if (reason === "ended") console.log("[VOICE NEW] audio ended");
      else console.log("[VOICE NEW] audio error", { reason });
      if (currentBlobUrl === url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        currentBlobUrl = null;
      }
      try {
        options.onEnd?.();
      } catch {
        // ignore
      }
      resolve();
    };

    el.onplaying = () => {
      console.log("[VOICE NEW] audio playing");
      try {
        options.onStart?.();
      } catch {
        // ignore
      }
    };
    el.onended = () => finish("ended");
    el.onerror = () => finish("error");

    console.log("[VOICE NEW] audio play called");
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.catch((err) => {
        console.error("[VOICE NEW] audio play rejected", {
          name: err?.name,
          message: err?.message,
        });
        finish("rejected");
      });
    }
  });
}

// -------------------------------------------------------------------
// Legacy no-ops — behouden zodat bestaande imports blijven werken.
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

