import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BreathingOrb } from "@/components/breathing-orb";
import { orbReducer, type OrbState } from "@/lib/voice/orb-state";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { runVoicePipeline } from "@/lib/voice-pipeline.functions";

// Fase A vangnet: 60s harde max-opname. Echte silence-detection komt later
// (Web Audio AnalyserNode op de mic-stream).
const MAX_RECORDING_SECONDS = 60;
const DONE_HOLD_MS = 1600;

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

type Props = {
  onCompleted?: () => void;
};

export function VoiceOrb({ onCompleted }: Props) {
  const transcribe = useServerFn(transcribeAudio);
  const pipeline = useServerFn(runVoicePipeline);

  const [state, dispatch] = useReducer(orbReducer, "idle" as OrbState);
  const [confirmation, setConfirmation] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);

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
    async (blob: Blob, mimeType: string) => {
      try {
        const ext =
          mimeType.includes("mp4") ? "mp4"
          : mimeType.includes("mpeg") ? "mp3"
          : mimeType.includes("wav") ? "wav"
          : "webm";
        const file = new File([blob], `recording.${ext}`, { type: mimeType });
        const fd = new FormData();
        fd.append("file", file);

        const trans = await transcribe({ data: fd });
        dispatch({ type: "TRANSCRIBED" });

        const result = await pipeline({
          data: {
            text: trans.text,
            transcription_id: trans.transcription_id,
          },
        });

        if (result.status === "skipped") {
          // Zacht terug naar rust, geen bevestiging.
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

        // completed of needs_confirmation
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
    [transcribe, pipeline, onCompleted, scheduleReset],
  );

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
        // Lege opname → zacht terug, geen bevestiging.
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
    if (state === "idle" || state === "done" || state === "error") {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setConfirmation("");
      startListening();
    } else if (state === "listening") {
      stopListening();
    }
    // processing/speaking: tap doet niets
  }, [state, startListening, stopListening]);

  const hint =
    state === "listening" ? `Tik om te stoppen (${elapsed}s)`
    : state === "processing" ? "Even verwerken…"
    : state === "done" ? confirmation || "Klaar."
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
    </div>
  );
}
