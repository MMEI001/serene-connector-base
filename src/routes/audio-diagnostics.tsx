import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/audio-diagnostics")({
  head: () => ({
    meta: [
      { title: "Audio Diagnostics — HoofdRust" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AudioDiagnosticsPage,
});

const TEST_TEXT = "Dit is een audiotest van HoofdRust.";
// Kleine, betrouwbare publieke test-mp3 (SoundHelix).
const PUBLIC_MP3 =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

type Line = { t: string; msg: string };

function AudioDiagnosticsPage() {
  const [log, setLog] = useState<Line[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const push = useCallback((msg: string, extra?: unknown) => {
    const time = new Date().toISOString().slice(11, 23);
    const line =
      extra === undefined
        ? msg
        : `${msg} ${typeof extra === "string" ? extra : JSON.stringify(extra)}`;
    console.log("[AUDIO DIAG]", line);
    setLog((prev) => [...prev, { t: time, msg: line }]);
  }, []);

  const clearLog = () => setLog([]);

  // Device info bij mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      hasAudioContext:
        typeof window.AudioContext !== "undefined" ||
        typeof (window as unknown as { webkitAudioContext?: unknown })
          .webkitAudioContext !== "undefined",
      hasSpeechSynthesis: "speechSynthesis" in window,
      hasMediaSession: "mediaSession" in navigator,
    };
    push("device info", info);
  }, [push]);

  // Één gedeeld <audio> element voor test 2 en 3.
  const getAudioEl = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = "auto";
    // @ts-expect-error iOS Safari
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    audioRef.current = el;
    return el;
  }, []);

  const attachAudioListeners = useCallback(
    (el: HTMLAudioElement, label: string) => {
      el.onplaying = () => push(`[${label}] audio.onplaying`, {
        currentTime: el.currentTime,
        duration: el.duration,
      });
      el.onended = () => push(`[${label}] audio.onended`);
      el.onerror = () =>
        push(`[${label}] audio.onerror`, {
          code: el.error?.code,
          message: el.error?.message,
        });
      el.onpause = () => {
        if (!el.ended)
          push(`[${label}] audio.onpause (unexpected)`, {
            currentTime: el.currentTime,
          });
      };
      el.onstalled = () => push(`[${label}] audio.onstalled`);
      el.onsuspend = () => push(`[${label}] audio.onsuspend`);
    },
    [push],
  );

  const logAudioState = useCallback(
    (label: string, el: HTMLAudioElement) => {
      push(`[${label}] audio state`, {
        muted: el.muted,
        volume: el.volume,
        paused: el.paused,
        readyState: el.readyState,
        networkState: el.networkState,
        src: el.src ? el.src.slice(0, 60) + (el.src.length > 60 ? "…" : "") : "",
      });
    },
    [push],
  );

  const logCtxState = useCallback(() => {
    const ctx = audioCtxRef.current;
    push("AudioContext state", { state: ctx?.state ?? "no-context" });
  }, [push]);

  // -------------------------------------------------------------
  // Test 1: Web Audio API beep
  // -------------------------------------------------------------
  const testBeep = useCallback(async () => {
    push("=== TEST 1: browser beep (Web Audio API) ===");
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const ctx = audioCtxRef.current!;
      push("AudioContext before resume", { state: ctx.state });
      if (ctx.state === "suspended") {
        await ctx.resume();
        push("AudioContext after resume", { state: ctx.state });
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.35);
      osc.onended = () => push("beep oscillator ended");
      push("beep scheduled", { at: now, duration: 0.35 });
    } catch (err) {
      push("beep threw", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      });
    }
  }, [push]);

  // -------------------------------------------------------------
  // Test 2: publieke mp3
  // -------------------------------------------------------------
  const testMp3 = useCallback(async () => {
    push("=== TEST 2: public mp3 via HTMLAudioElement ===");
    const el = getAudioEl();
    try {
      el.pause();
    } catch {
      // ignore
    }
    attachAudioListeners(el, "mp3");
    el.src = PUBLIC_MP3;
    logAudioState("mp3", el);
    push("[mp3] audio.play called");
    try {
      const p = el.play();
      if (p && typeof p.then === "function") {
        await p;
        push("[mp3] audio.play resolved");
      }
    } catch (err) {
      push("[mp3] audio.play rejected", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      });
    }
  }, [attachAudioListeners, getAudioEl, logAudioState, push]);

  // -------------------------------------------------------------
  // Test 3: ElevenLabs blob via edge function
  // -------------------------------------------------------------
  const testElevenLabs = useCallback(async () => {
    push("=== TEST 3: ElevenLabs blob ===");
    const SUPABASE_URL =
      import.meta.env.VITE_SUPABASE_URL ||
      (typeof process !== "undefined" ? process.env.SUPABASE_URL : "");
    const ANON =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (typeof process !== "undefined"
        ? process.env.SUPABASE_PUBLISHABLE_KEY
        : "");
    if (!SUPABASE_URL || !ANON) {
      push("[el] supabase config missing");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? ANON;
    if (!sessionData.session) {
      push("[el] geen ingelogde sessie — edge function eist auth. Log eerst in.");
      return;
    }

    push("[el] tts request", { url: `${SUPABASE_URL}/functions/v1/text-to-speech` });
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/text-to-speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: TEST_TEXT }),
      });
    } catch (err) {
      push("[el] fetch threw", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      });
      return;
    }
    push("[el] response status", res.status);
    push("[el] response content-type", res.headers.get("content-type"));
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      push("[el] non-ok body", txt.slice(0, 200));
      return;
    }
    const blob = await res.blob();
    push("[el] blob size", { size: blob.size, type: blob.type });

    const url = URL.createObjectURL(blob);
    const el = getAudioEl();
    try {
      el.pause();
    } catch {
      // ignore
    }
    attachAudioListeners(el, "el");
    el.src = url;
    logAudioState("el", el);
    push("[el] audio.play called");
    try {
      const p = el.play();
      if (p && typeof p.then === "function") {
        await p;
        push("[el] audio.play resolved");
      }
    } catch (err) {
      push("[el] audio.play rejected", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      });
    }
  }, [attachAudioListeners, getAudioEl, logAudioState, push]);

  // -------------------------------------------------------------
  // Test 4: speechSynthesis
  // -------------------------------------------------------------
  const testSpeechSynth = useCallback(() => {
    push("=== TEST 4: speechSynthesis ===");
    if (!("speechSynthesis" in window)) {
      push("[ss] not supported");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(TEST_TEXT);
      u.lang = "nl-NL";
      u.onstart = () => push("[ss] onstart");
      u.onend = () => push("[ss] onend");
      u.onerror = (e) =>
        push("[ss] onerror", { error: (e as SpeechSynthesisErrorEvent).error });
      const voices = window.speechSynthesis.getVoices();
      push("[ss] voices count", voices.length);
      window.speechSynthesis.speak(u);
      push("[ss] speak called", {
        speaking: window.speechSynthesis.speaking,
        pending: window.speechSynthesis.pending,
      });
    } catch (err) {
      push("[ss] threw", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      });
    }
  }, [push]);

  // -------------------------------------------------------------
  // Test 5: Unlock audio (iOS)
  // -------------------------------------------------------------
  const testUnlock = useCallback(async () => {
    push("=== TEST 5: unlock audio ===");
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const ctx = audioCtxRef.current!;
      push("ctx before resume", { state: ctx.state });
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      push("ctx after resume", { state: ctx.state });
      // Stille micro-beep om iOS-audio te unlocken.
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
      push("silent buffer played");

      // En unlock ook <audio>: probeer een leeg element te "primen".
      const el = getAudioEl();
      // Data-URI van een super korte stille WAV (44 bytes header + 0 samples).
      el.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      try {
        await el.play();
        push("silent <audio> primed");
        el.pause();
        el.currentTime = 0;
      } catch (err) {
        push("silent <audio> play rejected", {
          name: (err as Error)?.name,
          message: (err as Error)?.message,
        });
      }
      logCtxState();
    } catch (err) {
      push("unlock threw", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      });
    }
  }, [getAudioEl, logCtxState, push]);

  const btn =
    "rounded-xl bg-white/70 px-4 py-3 text-sm font-medium text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-200 active:scale-95 text-left";

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <header className="pt-4 pb-6">
        <h1 className="text-xl font-semibold">Audio Diagnostics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Geïsoleerde audio-tests. Los van orb, brain, whisper en app state.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2">
        <button className={btn} onClick={testBeep}>
          1. Test browser beep (Web Audio API)
        </button>
        <button className={btn} onClick={testMp3}>
          2. Test mp3 file (publieke url)
        </button>
        <button className={btn} onClick={testElevenLabs}>
          3. Test ElevenLabs blob (edge function)
        </button>
        <button className={btn} onClick={testSpeechSynth}>
          4. Test speechSynthesis
        </button>
        <button className={btn} onClick={testUnlock}>
          5. Unlock audio (iOS)
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {log.length} log lines
        </div>
        <button
          className="text-xs text-muted-foreground underline"
          onClick={clearLog}
          type="button"
        >
          clear
        </button>
      </div>

      <pre className="mt-2 rounded-xl bg-black/85 text-green-200 text-[11px] leading-relaxed p-3 overflow-x-auto max-h-[60vh] whitespace-pre-wrap break-all">
        {log.length === 0
          ? "(nog geen output — tik op een test)"
          : log.map((l, i) => `${l.t}  ${l.msg}`).join("\n")}
      </pre>
    </div>
  );
}
