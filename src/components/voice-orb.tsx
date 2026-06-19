import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { BreathingOrb } from "@/components/breathing-orb";
import { orbReducer, type OrbState } from "@/lib/voice/orb-state";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { runVoicePipeline } from "@/lib/voice-pipeline.functions";
import {
  savePendingAudio,
  deletePendingAudio,
} from "@/lib/voice/pending-audio";
import { useAuth } from "@/hooks/use-auth";

// Fase A vangnet: 60s harde max-opname. Echte silence-detection komt later
// (Web Audio AnalyserNode op de mic-stream).
const MAX_RECORDING_SECONDS = 60;
const DONE_HOLD_MS = 1600;

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function blobExt(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

type Props = {
  onCompleted?: () => void;
};

type Pending = { id: string; blob: Blob; mimeType: string } | null;

export function VoiceOrb({ onCompleted }: Props) {
  const { user } = useAuth();
  const transcribe = useServerFn(transcribeAudio);
  const pipeline = useServerFn(runVoicePipeline);

  const [state, dispatch] = useReducer(orbReducer, "idle" as OrbState);
  const [confirmation, setConfirmation] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<Pending>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      cleanupStream();
    };
  }, [stopTimer, cleanupStream]);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setConfirmation("");
      dispatch({ type: "RESET" });
    }, DONE_HOLD_MS);
  }, []);

  const runPipeline = useCallback(
    async (blob: Blob, mimeType: string, existingPendingId?: string) => {
      // Stap 1: transcribe. Bij fout → blob bewaren voor retry, geen auto-reset.
      let trans: Awaited<ReturnType<typeof transcribe>>;
      try {
        const file = new File([blob], `recording.${blobExt(mimeType)}`, { type: mimeType });
        const fd = new FormData();
        fd.append("file", file);
        trans = await transcribe({ data: fd });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcriptie lukte niet.";
        try {
          const saved = await savePendingAudio({
            id: existingPendingId,
            user_id: user?.id ?? null,
            blob,
            mime_type: mimeType,
          });
          setPending({ id: saved.id, blob, mimeType });
        } catch (e) {
          console.error("[voice-orb] kon audio niet bewaren", e);
        }
        setConfirmation("");
        dispatch({ type: "FAIL", message: msg });
        toast.error("Het lukte even niet. Tik op opnieuw om te proberen.");
        return; // bewust geen scheduleReset — retry-knop blijft staan
      }

      dispatch({ type: "TRANSCRIBED" });

      // Transcriptie geslaagd → pending audio is overbodig.
      if (existingPendingId) {
        deletePendingAudio(existingPendingId).catch(() => {});
      }
      setPending(null);

      // Stap 2: dispatcher
      try {
        const result = await pipeline({
          data: { text: trans.text, transcription_id: trans.transcription_id },
        });

        if (result.status === "skipped") {
          setConfirmation("");
          dispatch({ type: "RESET" });
          return;
        }

        if (result.status === "failed") {
          setConfirmation("");
          dispatch({ type: "FAIL", message: result.error });
          toast.error(result.confirmation || "Er ging iets mis.");
          scheduleReset();
          return;
        }

        setConfirmation(result.confirmation);
        dispatch({ type: "DISPATCHED" });
        vibrate(20);
        if (result.status === "completed") onCompleted?.();
        scheduleReset();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Er ging iets mis.";
        setConfirmation("");
        dispatch({ type: "FAIL", message: msg });
        toast.error(msg);
        scheduleReset();
      }
    },
    [transcribe, pipeline, onCompleted, scheduleReset, user?.id],
  );

  const retryPending = useCallback(async () => {
    if (!pending) return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setConfirmation("");
    // Forceer terug naar processing: simuleer een nieuwe tap-flow.
    dispatch({ type: "RESET" });
    dispatch({ type: "TAP" });
    dispatch({ type: "STOP" });
    await runPipeline(pending.blob, pending.mimeType, pending.id);
  }, [pending, runPipeline]);

  const startListening = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Geef toegang tot de microfoon om in te spreken.");
      return;
    }
    streamRef.current = stream;

    const mimeType =
      ["audio/webm", "audio/mp4"].find(
        (t) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(t),
      ) ?? "";
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      cleanupStream();
      toast.error("Deze browser ondersteunt geen audio-opname.");
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      cleanupStream();
      stopTimer();
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      setElapsed(0);

      if (blob.size < 1024) {
        dispatch({ type: "RESET" });
        return;
      }
      await runPipeline(blob, type);
    };

    recorderRef.current = recorder;
    recorder.start();
    dispatch({ type: "TAP" });
    vibrate(30);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_RECORDING_SECONDS && recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
        return next;
      });
    }, 1000);
  }, [cleanupStream, runPipeline, stopTimer]);

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    dispatch({ type: "STOP" });
  }, []);

  const handleTap = useCallback(() => {
    if (state === "error" && pending) {
      retryPending();
      return;
    }
    if (state === "idle" || state === "done" || state === "error") {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setConfirmation("");
      startListening();
    } else if (state === "listening") {
      stopListening();
    }
  }, [state, pending, retryPending, startListening, stopListening]);

  const hint =
    state === "listening" ? `Tik om te stoppen (${elapsed}s)`
    : state === "processing" ? "Even verwerken…"
    : state === "done" ? confirmation || "Klaar."
    : state === "error" && pending ? "Het lukte even niet. Tik om opnieuw te proberen."
    : state === "error" ? "Probeer opnieuw"
    : "Tik om te spreken";

  return (
    <div className="flex flex-col items-center">
      <BreathingOrb
        recording={state === "listening" || state === "processing"}
        blooming={state === "done"}
        onTap={handleTap}
        ariaLabel={hint}
      />
      <p
        aria-live="polite"
        className="mt-6 min-h-[1.5rem] text-sm text-muted-foreground"
      >
        {hint}
      </p>
      {state === "error" && pending && (
        <button
          type="button"
          onClick={retryPending}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-medium text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.02] active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Opnieuw proberen
        </button>
      )}
    </div>
  );
}
