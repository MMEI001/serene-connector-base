import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte

let cachedEnabled: boolean | null = null;
let cachedVoiceId: string | null = null;
let cachedProvider: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
let ttsUnavailableUntil = 0; // epoch ms; skip ElevenLabs until then

type LogDetails = Record<string, unknown>;
function logTts(event: string, details?: LogDetails) {
  // Eén consistent log-formaat zodat we de hele flow kunnen volgen.
  console.log(`[TTS] ${event}`, details ?? {});
}

function browserSpeak(text: string, intent?: string) {
  logTts("fallback_browser", { intent, provider: "browser" });
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      logTts("audio_play_failed", { intent, provider: "browser", reason: "no_speech_synthesis" });
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "nl-NL";
    utter.rate = 1;
    const tStart = performance.now();
    utter.onstart = () => logTts("audio_play_started", { intent, provider: "browser" });
    utter.onend = () =>
      logTts("audio_play_ended", {
        intent,
        provider: "browser",
        duration_ms: Math.round(performance.now() - tStart),
      });
    utter.onerror = (e) =>
      logTts("audio_play_failed", { intent, provider: "browser", reason: "utterance_error", error: String((e as SpeechSynthesisErrorEvent).error ?? "") });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (err) {
    logTts("audio_play_failed", { intent, provider: "browser", reason: "exception", error: err instanceof Error ? err.message : String(err) });
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

let authListenerAttached = false;
function ensureAuthListener() {
  if (authListenerAttached) return;
  if (typeof window === "undefined") return;
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        logTts("auth_event_reset_cache", { event });
        resetVoicePreferenceCache();
      }
    });
    authListenerAttached = true;
  } catch {
    // ignore
  }
}

async function loadPrefs(
  intent?: string,
): Promise<{ enabled: boolean; voiceId: string; provider: string }> {
  ensureAuthListener();
  if (cachedEnabled !== null && cachedVoiceId !== null && cachedProvider !== null) {
    logTts("prefs_loaded", {
      intent,
      source: "cache",
      voice_enabled_effective: cachedEnabled,
      voice_provider: cachedProvider,
      voice_id: cachedVoiceId,
    });
    return { enabled: cachedEnabled, voiceId: cachedVoiceId, provider: cachedProvider };
  }
  // getSession() is lokaal en doet geen netwerkcall — geen 403-risico.
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    logTts("prefs_load_failed", {
      intent,
      source: "default_no_session",
      voice_enabled_effective: false,
    });
    return { enabled: false, voiceId: DEFAULT_VOICE_ID, provider: "elevenlabs" };
  }
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, voice_enabled, voice_provider, voice_id" as "*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    logTts("prefs_load_failed", {
      intent,
      source: "default_query_error",
      user_id: user.id,
      voice_enabled_effective: false,
      error_message: error.message,
      error_code: error.code,
    });
    return { enabled: false, voiceId: DEFAULT_VOICE_ID, provider: "elevenlabs" };
  }
  const row = data as {
    id?: string;
    voice_enabled?: boolean | null;
    voice_provider?: string | null;
    voice_id?: string | null;
  } | null;
  if (!row) {
    logTts("prefs_load_failed", {
      intent,
      source: "default_no_row",
      user_id: user.id,
      voice_enabled_effective: false,
    });
    return { enabled: false, voiceId: DEFAULT_VOICE_ID, provider: "elevenlabs" };
  }
  const enabled = Boolean(row.voice_enabled);
  const provider = row.voice_provider || "elevenlabs";
  const voiceId = row.voice_id || DEFAULT_VOICE_ID;
  cachedEnabled = enabled;
  cachedVoiceId = voiceId;
  cachedProvider = provider;
  logTts("prefs_loaded", {
    intent,
    source: "db",
    user_id: user.id,
    profile_id: row.id,
    voice_enabled_db: row.voice_enabled ?? null,
    voice_enabled_effective: enabled,
    voice_provider: provider,
    voice_id: voiceId,
  });
  return { enabled, voiceId, provider };
}

function stopCurrentAudio() {
  if (!currentAudio) return;
  try {
    currentAudio.onerror = null;
    currentAudio.onended = null;
    currentAudio.onplaying = null;
    currentAudio.pause();
    const src = currentAudio.src;
    if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
  } catch {
    // ignore
  }
  currentAudio = null;
}

/** Probeer een blob af te spelen; max 1 retry; daarna browser-TTS fallback. */
async function playWithRetry(
  blob: Blob,
  text: string,
  intent: string | undefined,
  t0: number,
): Promise<void> {
  const url = URL.createObjectURL(blob);

  const attempt = (n: 1 | 2): Promise<boolean> =>
    new Promise((resolve) => {
      stopCurrentAudio();
      const audio = new Audio(url);
      currentAudio = audio;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        logTts("audio_play_failed", { intent, attempt: n, reason: "playback_timeout_2s" });
        finish(false);
      }, 2000);

      audio.onplaying = () => {
        const ttfa = Math.round(performance.now() - t0);
        logTts("audio_play_started", { intent, attempt: n, provider: "elevenlabs", ttfa_ms: ttfa });
        logTts("audio_play_success", { intent, attempt: n, provider: "elevenlabs", ttfa_ms: ttfa });
        finish(true);
      };
      audio.onended = () => {
        logTts("audio_play_ended", { intent, provider: "elevenlabs" });
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
      };
      audio.onerror = () => {
        logTts("audio_play_failed", { intent, attempt: n, reason: "media_error", error: String(audio.error?.code ?? "") });
        finish(false);
      };

      audio.play().catch((err: unknown) => {
        const name = err instanceof Error ? err.name : "Error";
        const message = err instanceof Error ? err.message : String(err);
        logTts("audio_play_failed", { intent, attempt: n, reason: name, error: message });
        finish(false);
      });
    });

  const ok1 = await attempt(1);
  if (ok1) return;

  logTts("retry_attempt", { intent, attempt: 1 });
  const ok2 = await attempt(2);
  if (ok2) return;

  // Beide pogingen gefaald → browser TTS.
  stopCurrentAudio();
  URL.revokeObjectURL(url);
  browserSpeak(text, intent);
}

export async function speakText(
  text: string,
  opts?: { force?: boolean; voiceId?: string; intent?: string },
): Promise<void> {
  const intent = opts?.intent;
  const t0 = performance.now();
  try {
    logTts("speakText_called", { intent, length: text?.length ?? 0, force: Boolean(opts?.force) });
    if (!text || !text.trim()) return;

    let voiceId = opts?.voiceId ?? DEFAULT_VOICE_ID;
    let provider = "elevenlabs";
    let enabled = true;
    if (!opts?.voiceId) {
      const prefs = await loadPrefs(intent);
      enabled = prefs.enabled;
      voiceId = prefs.voiceId;
      provider = prefs.provider;
      if (!opts?.force && !enabled) {
        logTts("skipped_disabled", { intent, voice_enabled: enabled, voice_provider: provider });
        return;
      }
    } else {
      logTts("prefs_loaded", {
        intent,
        source: "override",
        voice_enabled_effective: true,
        voice_provider: provider,
        voice_id: voiceId,
      });
    }

    const SUPABASE_URL =
      import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : "");
    const ANON =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : "");
    if (!SUPABASE_URL || !ANON) {
      logTts("tts_request_failed", { intent, reason: "missing_supabase_env" });
      browserSpeak(text, intent);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? ANON;

    if (Date.now() < ttsUnavailableUntil) {
      logTts("cooldown_active", { intent, until: new Date(ttsUnavailableUntil).toISOString() });
      browserSpeak(text, intent);
      return;
    }

    if (provider !== "elevenlabs") {
      logTts("fallback_browser", { intent, reason: `unsupported_provider:${provider}` });
      browserSpeak(text, intent);
      return;
    }

    const tReq = performance.now();
    logTts("tts_request_started", { intent, voice_provider: provider, voice_id: voiceId });

    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, voice_id: voiceId }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logTts("tts_request_failed", { intent, reason: "network_error", error: message });
      browserSpeak(text, intent);
      return;
    }

    const contentType = res.headers.get("content-type") || "";
    const reqDuration = Math.round(performance.now() - tReq);
    logTts("tts_request_completed", { intent, status: res.status, ok: res.ok, contentType, duration_ms: reqDuration });

    if (!res.ok || contentType.includes("application/json")) {
      let fallback = true;
      let payload: unknown = null;
      try {
        payload = await res.json();
        fallback = (payload as { fallback?: boolean } | null)?.fallback !== false;
      } catch {
        // non-JSON failure: still fall back
      }
      logTts("tts_request_failed", { intent, status: res.status, fallback, payload });
      if (fallback) {
        ttsUnavailableUntil = Date.now() + 5 * 60 * 1000;
        browserSpeak(text, intent);
      }
      return;
    }

    const blob = await res.blob();
    await playWithRetry(blob, text, intent, t0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logTts("audio_play_failed", { intent, reason: "unexpected_exception", error: message });
    browserSpeak(text, intent);
  }
}
