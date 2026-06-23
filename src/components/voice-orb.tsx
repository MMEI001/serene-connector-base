import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, Check, X, Pencil } from "lucide-react";
import { BreathingOrb } from "@/components/breathing-orb";
import { QueryResultCard } from "@/components/voice-query-result";
import { orbReducer, type OrbState } from "@/lib/voice/orb-state";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { runVoicePipeline } from "@/lib/voice-pipeline.functions";
import {
  confirmVoiceAction,
  cancelVoiceAction,
  getPendingVoiceAction,
} from "@/lib/voice-confirm.functions";
import {
  savePendingAudio,
  deletePendingAudio,
} from "@/lib/voice/pending-audio";
import { speakText } from "@/lib/speak";
import { useAuth } from "@/hooks/use-auth";
import type { PipelineResult, QueryResult } from "@/lib/voice/types";

const MAX_RECORDING_SECONDS = 60;
const DONE_HOLD_MS = 1600;
const CONFIRM_TIMEOUT_MS = 30_000;

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

type Props = { onCompleted?: () => void };
type Pending = { id: string; blob: Blob; mimeType: string } | null;
type Confirming = {
  action_id: string;
  intent: string;
  preview: string;
  expires_at: string;
} | null;

export function VoiceOrb({ onCompleted }: Props) {
  const { user } = useAuth();
  const transcribe = useServerFn(transcribeAudio);
  const pipeline = useServerFn(runVoicePipeline);
  const confirmFn = useServerFn(confirmVoiceAction);
  const cancelFn = useServerFn(cancelVoiceAction);
  const getPending = useServerFn(getPendingVoiceAction);

  const [state, dispatch] = useReducer(orbReducer, "idle" as OrbState);
  const [confirmation, setConfirmation] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [revive, setRevive] = useState<Confirming>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      cleanupStream();
    };
  }, [stopTimer, cleanupStream]);

  // Bij mount: check of er een nog-niet-verlopen pending actie is (revive na timeout).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getPending()
      .then((p) => {
        if (cancelled || !p) return;
        setRevive(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, getPending]);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setConfirmation("");
      setQueryResult(null);
      dispatch({ type: "RESET" });
    }, DONE_HOLD_MS);
  }, []);

  const handleResult = useCallback(
    (result: PipelineResult) => {
      if (result.status === "skipped") {
        setConfirmation("");
        dispatch({ type: "RESET" });
        return;
      }
      if (result.status === "needs_confirmation" && result.action_id) {
        setConfirmation(result.confirmation);
        // assistant_chat met vervolgacties → spreek de adviserende reply uit,
        // anders de standaard "Ik heb dit voor je klaargezet."-vraag.
        const spokenConfirm = result.assistant_reply?.trim()
          ? `${result.assistant_reply.trim()} Wil je dit zo bevestigen?`
          : "Ik heb dit voor je klaargezet. Wil je dit bevestigen?";
        void speakText(spokenConfirm);
        setConfirming({
          action_id: result.action_id,
          intent: result.intent,
          preview: result.preview ?? result.confirmation,
          expires_at: result.expires_at ?? new Date(Date.now() + CONFIRM_TIMEOUT_MS).toISOString(),
        });
        setRevive(null);
        dispatch({ type: "NEEDS_CONFIRMATION" });
        // 30s "snoozen" — daarna blijft 'm 5 min revive-baar via getPending
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = setTimeout(() => {
          setConfirming((cur) => {
            if (!cur) return cur;
            setRevive(cur);
            return null;
          });
          setConfirmation("");
          dispatch({ type: "RESET" });
        }, CONFIRM_TIMEOUT_MS);
        return;
      }
      if (result.status === "failed") {
        setConfirmation("");
        dispatch({ type: "FAIL", message: result.error });
        toast.error(result.confirmation || "Er ging iets mis.");
        scheduleReset();
        return;
      }
      // completed — korte gesproken bevestiging.
      setConfirmation(result.confirmation);
      // Prioriteit: assistant_reply (adviserend antwoord) → query-intro → confirmation → fallback.
      const spoken = result.assistant_reply?.trim()
        || result.query_result?.intro?.trim()
        || result.confirmation
        || "Staat erin.";
      void speakText(spoken);
      dispatch({ type: "DISPATCHED" });
      vibrate(20);
      onCompleted?.();
      if (result.query_result) {
        // Query-resultaat blijft staan tot gebruiker 'm sluit of nieuwe opname start.
        setQueryResult(result.query_result);
      } else {
        scheduleReset();
      }

    },
    [onCompleted, scheduleReset],
  );

  const runPipeline = useCallback(
    async (blob: Blob, mimeType: string, existingPendingId?: string) => {
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
        return;
      }

      dispatch({ type: "TRANSCRIBED" });
      if (existingPendingId) deletePendingAudio(existingPendingId).catch(() => {});
      setPending(null);

      try {
        const result = await pipeline({
          data: { text: trans.text, transcription_id: trans.transcription_id },
        });
        handleResult(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Er ging iets mis.";
        setConfirmation("");
        dispatch({ type: "FAIL", message: msg });
        toast.error(msg);
        scheduleReset();
      }
    },
    [transcribe, pipeline, handleResult, scheduleReset, user?.id],
  );

  const retryPending = useCallback(async () => {
    if (!pending) return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setConfirmation("");
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

  const handleConfirm = useCallback(
    async (actionId: string) => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirming(null);
      setRevive(null);
      dispatch({ type: "CONFIRM" });
      setConfirmation("Even verwerken…");
      try {
        const result = await confirmFn({ data: { action_id: actionId } });
        handleResult(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Er ging iets mis.";
        dispatch({ type: "FAIL", message: msg });
        toast.error(msg);
        scheduleReset();
      }
    },
    [confirmFn, handleResult, scheduleReset],
  );

  const handleCancel = useCallback(
    async (actionId: string) => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirming(null);
      setRevive(null);
      setConfirmation("");
      dispatch({ type: "CANCEL" });
      cancelFn({ data: { action_id: actionId } }).catch(() => {});
    },
    [cancelFn],
  );

  const handleTap = useCallback(() => {
    if (state === "confirming") return; // alleen via knoppen
    if (state === "error" && pending) {
      retryPending();
      return;
    }
    if (state === "idle" || state === "done" || state === "error") {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setConfirmation("");
      setQueryResult(null);
      startListening();
    } else if (state === "listening") {
      stopListening();
    }
  }, [state, pending, retryPending, startListening, stopListening]);

  const hint =
    state === "listening" ? `Tik om te stoppen (${elapsed}s)`
    : state === "processing" ? "Even verwerken…"
    : state === "confirming" ? (confirming?.preview?.includes("\n") ? "Klopt dit?" : confirming?.preview ?? "Klopt dit?")
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
        className="mt-6 min-h-[1.5rem] text-sm text-muted-foreground text-center px-6"
      >
        {hint}
      </p>

      {state === "confirming" && confirming && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {confirming.preview.includes("\n") && (
            <div className="max-w-xs rounded-2xl bg-white/60 px-4 py-3 text-sm text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] whitespace-pre-line text-left">
              {confirming.preview}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleCancel(confirming.action_id)}
              className="inline-flex items-center gap-2 rounded-full bg-white/60 px-5 py-2.5 text-sm font-medium text-foreground/70 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-200 active:scale-95"
            >
              <X className="h-4 w-4" />
              Annuleer
            </button>
            <button
              type="button"
              onClick={() => handleConfirm(confirming.action_id)}
              className="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-medium text-background backdrop-blur-md shadow-[0_2px_12px_rgba(139,126,115,0.12)] transition-transform duration-200 active:scale-95"
            >
              <Check className="h-4 w-4" />
              Bevestig
            </button>
          </div>
        </div>
      )}

      {state === "error" && pending && (
        <button
          type="button"
          onClick={retryPending}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-medium text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-300 active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Opnieuw proberen
        </button>
      )}

      {queryResult && (
        <QueryResultCard
          data={queryResult}
          onClose={() => {
            setQueryResult(null);
            setConfirmation("");
            dispatch({ type: "RESET" });
          }}
        />
      )}


      {state === "idle" && revive && (
        <button
          type="button"
          onClick={() => handleConfirm(revive.action_id)}
          className="mt-4 inline-flex flex-col items-center gap-1 rounded-2xl bg-white/60 px-5 py-3 text-sm text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-200 active:scale-95"
        >
          <span className="text-xs text-muted-foreground">Nog niet bevestigd</span>
          <span className="font-medium">{revive.preview}</span>
          <span className="text-xs text-muted-foreground mt-0.5">Tik om alsnog te bevestigen</span>
        </button>
      )}
    </div>
  );
}
