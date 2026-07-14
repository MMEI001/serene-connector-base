/**
 * Per-turn latency profiler for the voice pipeline (client-side).
 *
 * Emits a single structured `[perf]` console line per turn so we can
 * baseline and track: transcribe → server pipeline → tts → first audio.
 *
 * Kept intentionally tiny — no UI, no persistence, no network.
 */

export type PerfStage =
  | "recording_end"
  | "transcribe_start"
  | "transcribe_end"
  | "pipeline_start"
  | "pipeline_end"
  | "speak_start"
  | "tts_first_byte"
  | "audio_play_start"
  | "audio_end";

type Marks = Partial<Record<PerfStage, number>>;

let current: { turn: string; marks: Marks } | null = null;
let emitted = false;

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function startTurn(): string {
  const turn =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `t_${Date.now().toString(36)}`;
  current = { turn, marks: {} };
  emitted = false;
  return turn;
}

export function mark(stage: PerfStage) {
  if (!current) return;
  current.marks[stage] = now();
}

export function currentTurnId(): string | null {
  return current?.turn ?? null;
}

function d(a?: number, b?: number): string {
  if (a == null || b == null) return "—";
  return `${Math.round(b - a)}`;
}

export function emit(extra?: Record<string, unknown>) {
  if (!current || emitted) return;
  emitted = true;
  const m = current.marks;
  const total =
    m.recording_end != null && (m.audio_play_start ?? m.tts_first_byte ?? m.pipeline_end) != null
      ? Math.round(
          (m.audio_play_start ?? m.tts_first_byte ?? m.pipeline_end)! - m.recording_end,
        )
      : null;
  const line = {
    turn: current.turn,
    transcribe: d(m.transcribe_start, m.transcribe_end),
    pipeline: d(m.pipeline_start, m.pipeline_end),
    tts_ttfb: d(m.speak_start, m.tts_first_byte),
    audio_start: d(m.tts_first_byte, m.audio_play_start),
    first_word_ms:
      m.recording_end != null && m.audio_play_start != null
        ? Math.round(m.audio_play_start - m.recording_end)
        : null,
    total_ms: total,
    ...extra,
  };
  console.log(
    "%c[perf voice]",
    "background:#10B981;color:white;font-weight:bold;padding:2px 6px;border-radius:4px;",
    line,
  );
}
