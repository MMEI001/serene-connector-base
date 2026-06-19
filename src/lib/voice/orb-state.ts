// Pure state-machine voor de orb. Geen UI, geen side-effects.
// UI consumeert dit via een hook (zie voice-orb.tsx).

export type OrbState =
  | "idle"
  | "listening"
  | "processing"
  | "done"
  | "speaking" // gereserveerd voor fase C (TTS)
  | "error";

export type OrbEvent =
  | { type: "TAP" }
  | { type: "STOP" }
  | { type: "TRANSCRIBED" }
  | { type: "DISPATCHED" }
  | { type: "SPOKEN" } // fase C
  | { type: "FAIL"; message?: string }
  | { type: "RESET" };

export function orbReducer(state: OrbState, event: OrbEvent): OrbState {
  switch (state) {
    case "idle":
      if (event.type === "TAP") return "listening";
      return state;
    case "listening":
      if (event.type === "STOP") return "processing";
      if (event.type === "FAIL") return "error";
      return state;
    case "processing":
      if (event.type === "TRANSCRIBED") return "processing"; // blijft processing tot dispatch klaar
      if (event.type === "DISPATCHED") return "done";
      if (event.type === "FAIL") return "error";
      return state;
    case "done":
      if (event.type === "RESET") return "idle";
      if (event.type === "TAP") return "listening";
      return state;
    case "speaking":
      if (event.type === "SPOKEN") return "idle";
      return state;
    case "error":
      if (event.type === "RESET" || event.type === "TAP") return "idle";
      return state;
  }
}
