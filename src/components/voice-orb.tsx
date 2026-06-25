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
import {
  preloadAckAudio,
  playAcknowledgement,
  stopAcknowledgement,
} from "@/lib/voice/ack-audio";
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
type Editable = {
  intent: "reminder" | "event";
  title: string;
  iso_datetime?: string;
  date?: string;
  start_time?: string;
};
type Confirming = {
  action_id: string;
  intent: string;
  preview: string;
  expires_at: string;
  editable?: Editable;
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
  // (revive wordt nu via `confirming` afgehandeld — één en dezelfde editable card)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDateTime, setEditDateTime] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Wrapper: zet orb-mode op "speaking" zolang de TTS-call (incl. afspelen) loopt.
  const speakAndAnimate = useCallback(
    async (text: string, opts?: Parameters<typeof speakText>[1]) => {
      setIsSpeaking(true);
      // Het echte AI-antwoord begint nu te spreken — kap de wacht-erkenning af.
      stopAcknowledgement();
      try {
        await speakText(text, opts);
      } finally {
        setIsSpeaking(false);
      }
    },
    [],
  );


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

  // Bij mount: check of er een nog-niet-verlopen pending actie is (revive na app-restart of timeout).
  // We hydrateren de bestaande confirming-flow zodat Bewerken/Annuleer/Bevestig identiek werken.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getPending()
      .then((p) => {
        if (cancelled || !p) return;
        // Alleen reviven als we niet al midden in een nieuwe interactie zitten.
        setConfirming((cur) => {
          if (cur) return cur;
          // Niet de orb-state op "confirming" zetten: gebruiker mag direct
          // nieuwe input geven. De bevestigingskaart blijft staan tot de
          // gebruiker Bevestig/Bewerken/Annuleer kiest of een nieuwe actie
          // de pending vervangt.
          return {
            action_id: p.action_id,
            intent: p.intent,
            preview: p.preview,
            expires_at: p.expires_at,
            editable: p.editable,
          };
        });

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
        setConfirming(null);
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
        void speakAndAnimate(spokenConfirm, { intent: result.assistant_reply ? "assistant_chat_confirm" : "confirm" });
        setConfirming({
          action_id: result.action_id,
          intent: result.intent,
          preview: result.preview ?? result.confirmation,
          expires_at: result.expires_at ?? new Date(Date.now() + CONFIRM_TIMEOUT_MS).toISOString(),
          editable: result.editable,
        });
        setIsEditing(false);
        dispatch({ type: "NEEDS_CONFIRMATION" });
        // 30s "snooze": orb komt vrij voor nieuwe input, maar de bevestigingskaart
        // blijft staan (revive). Bevestig/Bewerken/Annuleer blijven beschikbaar
        // tot de server-side expiry (5 min) of een nieuwe pipeline-actie.
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = setTimeout(() => {
          setConfirmation("");
          dispatch({ type: "RESET" });
        }, CONFIRM_TIMEOUT_MS);
        return;

      }
      if (result.status === "failed") {
        setConfirmation("");
        setConfirming(null);
        dispatch({ type: "FAIL", message: result.error });
        toast.error(result.confirmation || "Er ging iets mis.");
        scheduleReset();
        return;
      }
      // completed — korte gesproken bevestiging.
      setConfirmation(result.confirmation);
      setConfirming(null);
      // Prioriteit: assistant_reply (adviserend antwoord) → query-intro → confirmation → fallback.
      const spoken = result.assistant_reply?.trim()
        || result.query_result?.intro?.trim()
        || result.confirmation
        || "Staat erin.";
      void speakAndAnimate(spoken, { intent: result.intent });
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
    async (
      actionId: string,
      overrides?: { title?: string; iso_datetime?: string; date?: string; start_time?: string },
    ) => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirming(null);
      setIsEditing(false);

      dispatch({ type: "CONFIRM" });
      setConfirmation("Even verwerken…");
      try {
        const result = await confirmFn({ data: { action_id: actionId, overrides } });
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
      setIsEditing(false);

      setConfirmation("");
      dispatch({ type: "CANCEL" });
      cancelFn({ data: { action_id: actionId } }).catch(() => {});
    },
    [cancelFn],
  );

  const openEditor = useCallback(() => {
    if (!confirming?.editable) return;
    const e = confirming.editable;
    setEditTitle(e.title ?? "");
    if (e.intent === "reminder" && e.iso_datetime) {
      // ISO met tz-offset → local "YYYY-MM-DDTHH:mm" voor datetime-local input.
      const d = new Date(e.iso_datetime);
      const pad = (n: number) => String(n).padStart(2, "0");
      setEditDateTime(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    } else {
      setEditDateTime("");
    }
    setEditDate(e.date ?? "");
    setEditTime(e.start_time ?? "");
    setIsEditing(true);
  }, [confirming]);

  const saveEdit = useCallback(() => {
    if (!confirming?.editable) return;
    const title = editTitle.trim();
    if (!title) {
      toast.error("Geef een korte titel.");
      return;
    }
    const overrides: { title?: string; iso_datetime?: string; date?: string; start_time?: string } = { title };
    if (confirming.editable.intent === "reminder") {
      if (!editDateTime) {
        toast.error("Kies een datum en tijd.");
        return;
      }
      // datetime-local is lokale tijd; converteer naar ISO met Europe/Amsterdam offset.
      const [datePart, timePart] = editDateTime.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      const utc = Date.UTC(y, m - 1, d, hh, mm);
      const dt = new Date(utc);
      const tzName = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Amsterdam",
        timeZoneName: "shortOffset",
      }).formatToParts(dt).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
      const off = tzName.match(/GMT([+-]\d+)/);
      const oh = off ? parseInt(off[1], 10) : 1;
      const sign = oh >= 0 ? "+" : "-";
      const pad = (n: number) => String(n).padStart(2, "0");
      overrides.iso_datetime = `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.abs(oh))}:00`;
    } else {
      if (!editDate || !editTime) {
        toast.error("Kies een datum en tijd.");
        return;
      }
      overrides.date = editDate;
      overrides.start_time = editTime;
    }
    void handleConfirm(confirming.action_id, overrides);
  }, [confirming, editTitle, editDateTime, editDate, editTime, handleConfirm]);


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
        mode={
          isSpeaking
            ? "speaking"
            : state === "listening"
              ? "listening"
              : state === "processing"
                ? "processing"
                : state === "done"
                  ? "speaking"
                  : "idle"
        }
        onTap={handleTap}
        ariaLabel={hint}
      />

      <p
        aria-live="polite"
        className="mt-6 min-h-[1.5rem] text-sm text-muted-foreground text-center px-6"
      >
        {hint}
      </p>

      {confirming && !isEditing && state !== "processing" && state !== "listening" && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {confirming.preview.includes("\n") && (() => {
            const [head, ...rest] = confirming.preview.split("\n");
            const sub = rest.join(" ").trim();
            return (
              <div className="max-w-xs rounded-2xl bg-white/60 px-4 py-3 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] text-left">
                <div className="text-sm text-foreground/80">{head}</div>
                {sub && (
                  <div className="mt-1 text-xs text-muted-foreground/80 line-clamp-2">{sub}</div>
                )}
              </div>
            );
          })()}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => handleCancel(confirming.action_id)}
              className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2.5 text-sm font-medium text-foreground/70 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-200 active:scale-95"
            >
              <X className="h-4 w-4" />
              Annuleer
            </button>
            {confirming.editable && (
              <button
                type="button"
                onClick={openEditor}
                className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2.5 text-sm font-medium text-foreground/70 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-200 active:scale-95"
              >
                <Pencil className="h-4 w-4" />
                Bewerken
              </button>
            )}
            <button
              type="button"
              onClick={() => handleConfirm(confirming.action_id)}
              className="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2.5 text-sm font-medium text-background backdrop-blur-md shadow-[0_2px_12px_rgba(139,126,115,0.12)] transition-transform duration-200 active:scale-95"
            >
              <Check className="h-4 w-4" />
              Bevestig
            </button>
          </div>
        </div>
      )}

      {confirming && isEditing && confirming.editable && state !== "processing" && state !== "listening" && (
        <div className="mt-4 flex flex-col items-stretch gap-3 w-full max-w-xs">
          <label className="flex flex-col gap-1 text-left">
            <span className="text-xs text-muted-foreground">Titel</span>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="rounded-xl bg-white/70 px-3 py-2 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-foreground/20"
              autoFocus
            />
          </label>
          {confirming.editable.intent === "reminder" ? (
            <label className="flex flex-col gap-1 text-left">
              <span className="text-xs text-muted-foreground">Datum en tijd</span>
              <input
                type="datetime-local"
                value={editDateTime}
                onChange={(e) => setEditDateTime(e.target.value)}
                className="rounded-xl bg-white/70 px-3 py-2 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </label>
          ) : (
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-left flex-1">
                <span className="text-xs text-muted-foreground">Datum</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="rounded-xl bg-white/70 px-3 py-2 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </label>
              <label className="flex flex-col gap-1 text-left flex-1">
                <span className="text-xs text-muted-foreground">Tijd</span>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="rounded-xl bg-white/70 px-3 py-2 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </label>
            </div>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-sm font-medium text-foreground/70 backdrop-blur-md border border-white/60 transition-transform duration-200 active:scale-95"
            >
              Terug
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2 text-sm font-medium text-background backdrop-blur-md shadow-[0_2px_12px_rgba(139,126,115,0.12)] transition-transform duration-200 active:scale-95"
            >
              <Check className="h-4 w-4" />
              Opslaan & bevestig
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




    </div>
  );
}
