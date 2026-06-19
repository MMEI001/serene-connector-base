import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { cn } from "@/lib/utils";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function VoiceInputButton({ onTranscript, disabled }: Props) {
  const transcribe = useServerFn(transcribeAudio);
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = async () => {
    if (state !== "idle") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Geef toegang tot de microfoon om in te spreken.");
      return;
    }
    streamRef.current = stream;

    const mimeType =
      ["audio/webm", "audio/mp4"].find((t) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
      ) ?? "";
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      toast.error("Deze browser ondersteunt geen audio-opname.");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      stopTimer();
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size < 1024) {
        toast.error("Opname was te kort. Houd de knop iets langer ingedrukt.");
        setState("idle");
        setElapsed(0);
        return;
      }
      setState("processing");
      try {
        const ext =
          type.includes("mp4") ? "mp4"
          : type.includes("mpeg") ? "mp3"
          : type.includes("wav") ? "wav"
          : "webm";
        const file = new File([blob], `recording.${ext}`, { type });
        const fd = new FormData();
        fd.append("file", file);
        const result = await transcribe({ data: fd });
        if (result.text) {
          onTranscript(result.text);
        } else {
          toast.error("Geen tekst herkend. Probeer opnieuw.");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcriptie lukte niet.";
        toast.error(msg);
      } finally {
        setState("idle");
        setElapsed(0);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setState("recording");
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= 120) {
          // automatisch stoppen na 2 min
          recorderRef.current?.state === "recording" && recorderRef.current?.stop();
        }
        return next;
      });
    }, 1000);
  };

  const stop = () => {
    if (state !== "recording") return;
    recorderRef.current?.state === "recording" && recorderRef.current?.stop();
  };

  const handleClick = () => {
    if (state === "idle") start();
    else if (state === "recording") stop();
  };

  const label =
    state === "recording" ? `Stop (${elapsed}s)`
    : state === "processing" ? "Transcriberen…"
    : "Inspreken";

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={handleClick}
      disabled={disabled || state === "processing"}
      className={cn(
        "rounded-full gap-2",
        state === "recording" && "border-destructive text-destructive animate-pulse",
      )}
    >
      {state === "processing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "recording" ? (
        <Square className="h-4 w-4 fill-current" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
