/**
 * Centrale Voice Service — garandeert dat de volledige app uitsluitend één
 * en dezelfde stem gebruikt over alle onderdelen heen.
 *
 * Beheert:
 * - Voorkeuren (voice_enabled, voice_provider, voice_id) vanuit user_profiles
 * - Audioweergave (pauzeert automatisch lopende audio bij nieuwe zinnen)
 * - Cache voor snelle acknowledgements (< 5ms afspeeltijd met exacte stem)
 * - Trace logging (provider, voice_id, model, latency per turn)
 */

import { supabase } from "@/integrations/supabase/client";
import * as perf from "@/lib/voice/perf";

export const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte
export const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

const ACK_PHRASES = [
  "Momentje…",
  "Even kijken…",
  "Ik denk met je mee.",
  "Ik kijk even.",
];

export type VoiceSpeakOptions = {
  intent?: string;
  route?: string;
  force?: boolean;
  voiceId?: string;
  isAck?: boolean;
  preloadOnly?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
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

let cachedEnabled: boolean | null = null;
let cachedVoiceId: string | null = null;
let cachedProvider: string | null = null;

let currentAudio: HTMLAudioElement | null = null;
let currentAudioRoute: string | null = null;
const audioBlobCache = new Map<string, Blob>();

// Monotoon token systeem: elke non-preload speak() bumpt de generatie.
// Een oudere (bv. acknowledgement) speak die nog in-flight is annuleert
// zichzelf zodra een nieuwere main-reply speak start. Dit voorkomt dat de
// ack het hoofdantwoord overschrijft door een async race.
let speakGeneration = 0;
let ackAbortController: AbortController | null = null;

let lastTraceLog: VoiceTraceLog | null = null;
const traceListeners = new Set<(trace: VoiceTraceLog) => void>();

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

function emitTrace(log: VoiceTraceLog) {
  lastTraceLog = log;
  console.log(
    "%c[VoiceService Turn]",
    "background: #3B82F6; color: white; font-weight: bold; padding: 2px 6px; border-radius: 4px;",
    log,
  );
  traceListeners.forEach((fn) => {
    try {
      fn(log);
    } catch {
      // ignore listener error
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

export function stopVoice(route?: string) {
  if (!currentAudio) return;
  if (route && currentAudioRoute !== route) return;
  try {
    currentAudio.onerror = null;
    currentAudio.onended = null;
    currentAudio.onpause = null;
    currentAudio.pause();
    const src = currentAudio.src;
    if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
  } catch {
    // ignore
  }
  currentAudio = null;
  currentAudioRoute = null;
}

function browserSpeakFallback(text: string, intent: string, route: string, latencyMs: number) {
  emitTrace({
    provider: "browser",
    voice_id: "system_default",
    model: "speech_synthesis",
    route,
    latency_ms: latencyMs,
    intent,
    text_preview: text.slice(0, 40),
    source: "browser",
    timestamp: new Date().toISOString(),
  });

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "nl-NL";
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

/**
 * Centrale speak functie. Gebruikt overal exact dezelfde ElevenLabs voice_id.
 * Bij fouten in ElevenLabs wordt stil gefaald met een trace-log, of vallen we
 * alleen terug op browser TTS als de gebruiker expliciet 'browser' als provider koos.
 */
export async function speak(
  text: string,
  options: VoiceSpeakOptions = {},
): Promise<void> {
  const t0 = performance.now();
  const intent = options.intent ?? "general";
  const route = options.route ?? (options.isAck ? "prewarm_ack" : intent);
  const cleanText = text?.trim() ?? "";
  const isMainReply = !options.isAck && !options.preloadOnly && route !== "prewarm_ack";
  if (isMainReply) perf.mark("speak_start");

  // Elke non-preload speak krijgt een uniek generatie-token. Een oudere ack
  // die nog in-flight is aborteert zichzelf zodra een nieuwer token bestaat.
  let myGeneration = speakGeneration;
  if (!options.preloadOnly) {
    speakGeneration += 1;
    myGeneration = speakGeneration;
  }
  const isStale = () => !options.preloadOnly && myGeneration !== speakGeneration;

  if (isMainReply) {
    console.log("%c[MAIN TTS START]", "color:#10b981;font-weight:bold", { gen: myGeneration, preview: cleanText.slice(0, 60) });
  } else if (options.isAck) {
    console.log("%c[ACK START]", "color:#f59e0b;font-weight:bold", { gen: myGeneration, preview: cleanText.slice(0, 40) });
  }

  console.log("[Voice 3] speak() entry", {
    route,
    intent,
    length: cleanText.length,
    generation: myGeneration,
  });
  console.log("[Voice 3.0] Final text →", cleanText);

  if (!cleanText) {
    console.warn("[Voice 3!] speak aborted: empty text");
    return;
  }

  const prefs = await loadVoicePrefs();
  const enabled = options.force ? true : prefs.enabled;
  const voiceId = options.voiceId ?? prefs.voiceId;
  const provider = prefs.provider;

  console.log("[Voice 3a] prefs", { enabled, voiceId, provider, force: !!options.force });

  if (!enabled && !options.force) {
    console.warn("[Voice 3!] speak aborted: voice disabled in user profile");
    return;
  }

  // Main reply cancelt eventuele in-flight ack fetch expliciet — anders
  // kan de ack later alsnog binnenkomen en het hoofdantwoord overschrijven.
  if (isMainReply && ackAbortController) {
    console.log("%c[ACK CANCEL]", "color:#f59e0b", "main reply gestart, ack fetch aborten");
    ackAbortController.abort();
    ackAbortController = null;
  }

  // Stoppen van eventuele eerdere audio (bv. acknowledgement clip)
  if (!options.preloadOnly) {
    stopVoice();
  }

  // Ack krijgt een eigen AbortController zodat main reply hem kan onderbreken.
  const abortController = options.isAck ? new AbortController() : null;
  if (options.isAck) {
    ackAbortController = abortController;
  }

  const cacheKey = `${voiceId}:${cleanText}`;

  // 1. Check lokale cache (supersnel voor acks en vaste reacties)
  if (audioBlobCache.has(cacheKey)) {
    const blob = audioBlobCache.get(cacheKey)!;
    if (options.preloadOnly) return;
    if (isStale()) {
      console.log("%c[ACK ABORT]", "color:#f59e0b", "stale voor cache-play", { gen: myGeneration, current: speakGeneration });
      return;
    }

    const latency = Math.round(performance.now() - t0);
    emitTrace({
      provider: "elevenlabs",
      voice_id: voiceId,
      model: DEFAULT_MODEL_ID,
      route,
      latency_ms: latency,
      intent,
      text_preview: cleanText.slice(0, 40),
      source: "cache",
      timestamp: new Date().toISOString(),
    });

    await playBlob(blob, options, myGeneration);
    return;
  }


  // 2. Als gebruiker expliciet browser TTS in profiel koos
  if (provider === "browser") {
    if (options.preloadOnly) return;
    const latency = Math.round(performance.now() - t0);
    browserSpeakFallback(cleanText, intent, route, latency);
    return;
  }

  // 3. Echte ElevenLabs call via edge function
  const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : "");
  const ANON =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : "");

  if (!SUPABASE_URL || !ANON) {
    const latency = Math.round(performance.now() - t0);
    emitTrace({
      provider: "elevenlabs",
      voice_id: voiceId,
      model: DEFAULT_MODEL_ID,
      route,
      latency_ms: latency,
      intent,
      text_preview: cleanText.slice(0, 40),
      source: "error",
      status: "config_error",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? ANON;

  let res: Response;
  try {
    const requestBody = { text: cleanText, voice_id: voiceId };
    console.log("[Voice 4] TTS fetch →", `${SUPABASE_URL}/functions/v1/text-to-speech`, { voiceId });
    console.log("[Voice 4.body] ElevenLabs request body", requestBody);
    res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: abortController?.signal,
    });
    console.log("[Voice 4a] TTS response", { status: res.status, contentType: res.headers.get("content-type") });
  } catch (err) {
    console.error("[Voice 4!] TTS fetch failed", err);
    const latency = Math.round(performance.now() - t0);
    emitTrace({
      provider: "elevenlabs",
      voice_id: voiceId,
      model: DEFAULT_MODEL_ID,
      route,
      latency_ms: latency,
      intent,
      text_preview: cleanText.slice(0, 40),
      source: "error",
      status: "network_error",
      timestamp: new Date().toISOString(),
    });
    // Voor de hoofd-reply MOET de gebruiker altijd iets horen — val terug
    // op browser TTS zodat de uitleg niet verloren gaat.
    if (isMainReply && !options.preloadOnly) {
      console.warn("[Voice 4→browser] fallback naar browser TTS na network error");
      browserSpeakFallback(cleanText, intent, route, latency);
    }
    return;
  }

  const contentType = res.headers.get("content-type") || "";
  const actualVoiceId = res.headers.get("x-voice-id") || voiceId;
  const actualModel = res.headers.get("x-voice-model") || DEFAULT_MODEL_ID;
  if (!res.ok || contentType.includes("application/json")) {
    let status = `http_${res.status}`;
    if (contentType.includes("application/json")) {
      const errorBody = await res.clone().json().catch(() => null) as {
        error?: string;
        upstream_status?: number;
      } | null;
      if (errorBody?.upstream_status) {
        status = `upstream_${errorBody.upstream_status}_via_http_${res.status}`;
      } else if (errorBody?.error) {
        status = `${errorBody.error}_via_http_${res.status}`;
      }
    }
    const latency = Math.round(performance.now() - t0);
    emitTrace({
      provider: "elevenlabs",
      voice_id: actualVoiceId,
      model: actualModel,
      route,
      latency_ms: latency,
      intent,
      text_preview: cleanText.slice(0, 40),
      source: "error",
      status,
      timestamp: new Date().toISOString(),
    });
    // 429/5xx: fallback naar browser-TTS voor de hoofd-reply zodat de
    // gebruiker altijd de uitleg hoort, ook bij ElevenLabs rate-limits.
    if (isMainReply && !options.preloadOnly) {
      console.warn("[Voice 4→browser] fallback naar browser TTS na", status);
      browserSpeakFallback(cleanText, intent, route, latency);
    }
    return;
  }

  const blob = await res.blob();
  if (isMainReply) perf.mark("tts_first_byte");
  console.log("[Voice 5] TTS blob received", { size: blob.size, type: blob.type });
  audioBlobCache.set(cacheKey, blob);

  if (options.preloadOnly) return;

  const latency = Math.round(performance.now() - t0);
  emitTrace({
    provider: "elevenlabs",
    voice_id: actualVoiceId,
    model: actualModel,
    route,
    latency_ms: latency,
    intent,
    text_preview: cleanText.slice(0, 40),
    source: "network",
    timestamp: new Date().toISOString(),
  });

  await playBlob(blob, options);
}

async function playBlob(blob: Blob, options: VoiceSpeakOptions): Promise<void> {
  console.log("[Voice 6] playBlob start", { size: blob.size, route: options.route });
  // Stop eventuele oudere audio VOOR we een nieuwe URL/element aanmaken,
  // zodat we nooit twee <audio> elementen tegelijk hebben op iOS Safari.
  stopVoice();
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const audio = new Audio();
    // iOS Safari-vereisten: playsInline voorkomt fullscreen-playback en
    // preload='auto' zorgt dat de volledige blob geladen is voordat we
    // .play() aanroepen — dit voorkomt dat playback halverwege stopt.
    audio.preload = "auto";
    // @ts-expect-error — playsInline bestaat op HTMLAudioElement in iOS.
    audio.playsInline = true;
    audio.setAttribute("playsinline", "true");
    audio.src = url;

    currentAudio = audio;
    currentAudioRoute = options.route ?? (options.isAck ? "prewarm_ack" : options.intent ?? "general");

    let settled = false;
    const finish = (reason: string) => {
      if (settled) return;
      settled = true;
      console.log("[Voice 6c] playBlob finish", { reason, route: currentAudioRoute });
      setTimeout(() => URL.revokeObjectURL(url), 250);
      if (currentAudio === audio) {
        currentAudio = null;
        currentAudioRoute = null;
      }
      options.onEnd?.();
      resolve();
    };

    audio.onplaying = () => {
      console.log("[Voice 6b] audio.onplaying");
      const routeName = options.route ?? (options.isAck ? "prewarm_ack" : options.intent ?? "general");
      if (routeName !== "prewarm_ack") {
        perf.mark("audio_play_start");
        perf.emit({ route: routeName });
      }
      options.onStart?.();
    };
    audio.onended = () => finish("ended");
    audio.onerror = (e) => {
      console.error("[Voice 6!] audio.onerror", {
        error: audio.error,
        code: audio.error?.code,
        message: audio.error?.message,
        event: e,
      });
      finish("error");
    };
    audio.onpause = () => {
      if (!audio.ended && !settled) {
        console.warn("[Voice 6?] audio.onpause (unexpected, before end)", {
          currentTime: audio.currentTime,
          duration: audio.duration,
        });
      }
    };

    const start = () => {
      console.log("[Voice 6a] audio.play() call", { readyState: audio.readyState });
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => console.log("[Voice 6a✓] audio.play() resolved"))
         .catch((err) => {
           console.error("[Voice 6a!] audio.play() rejected", { name: err?.name, message: err?.message });
           finish("play_rejected");
         });
      }
    };
    if (audio.readyState >= 3 /* HAVE_FUTURE_DATA */) {
      start();
    } else {
      const onReady = () => {
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("loadeddata", onReady);
        start();
      };
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("loadeddata", onReady, { once: true });
      setTimeout(() => {
        if (!settled && audio.paused) {
          console.warn("[Voice 6?] readyState timeout, forcing start", { readyState: audio.readyState });
          start();
        }
      }, 800);
      audio.load();
    }
  });
}

/**
 * Prewarm cache voor instant acknowledgements en veelvoorkomende zinnen
 * met de exacte actieve voice_id.
 */
export async function prewarmVoiceCache(): Promise<void> {
  const prefs = await loadVoicePrefs();
  if (!prefs.enabled || prefs.provider === "browser") return;

  ACK_PHRASES.forEach((phrase) => {
    speak(phrase, {
      intent: "acknowledgement",
      route: "prewarm_ack",
      voiceId: prefs.voiceId,
      force: true,
      preloadOnly: true,
    }).catch(() => {});
  });
}

/**
 * Speelt direct een snelle erkenning af. Bypasst vaste MP3's.
 * Garandeert 100% spraaksamenhang.
 */
export function playAcknowledgement(): () => void {
  const phrase = ACK_PHRASES[Math.floor(Math.random() * ACK_PHRASES.length)];
  void speak(phrase, { intent: "acknowledgement", route: "prewarm_ack", isAck: true });
  return stopAcknowledgement;
}

export const stopAcknowledgement = () => stopVoice("prewarm_ack");
