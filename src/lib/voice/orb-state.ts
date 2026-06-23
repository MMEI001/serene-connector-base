// Pure state-machine voor de orb. Geen UI, geen side-effects.

export type OrbState =
  | "idle"
  | "listening"
  | "processing"
  | "confirming" // wacht op Bevestig/Annuleer (fase B)
  | "done"
  | "speaking" // fase C (TTS)
  | "error";

export type OrbEvent =
  | { type: "TAP" }
  | { type: "STOP" }
  | { type: "TRANSCRIBED" }
  | { type: "DISPATCHED" }
  | { type: "NEEDS_CONFIRMATION" }
  | { type: "CONFIRM" }
  | { type: "CANCEL" }
  | { type: "SPOKEN" }
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
      if (event.type === "TRANSCRIBED") return "processing";
      if (event.type === "NEEDS_CONFIRMATION") return "confirming";
      if (event.type === "DISPATCHED") return "done";
      if (event.type === "FAIL") return "error";
      return state;
    case "confirming":
      if (event.type === "CONFIRM") return "processing";
      if (event.type === "CANCEL") return "idle";
      if (event.type === "FAIL") return "error";
      if (event.type === "RESET") return "idle";
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
