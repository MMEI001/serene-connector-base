import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MiniOrb } from "./mini-orb";

type Phase =
  | { kind: "breath"; cycle: number; step: "in" | "out" }
  | { kind: "welcome" }
  | { kind: "done" };

const CYCLES = 3;
const IN_MS = 4000;
const OUT_MS = 6000;
const WELCOME_MS = 3000;

type Props = {
  onDone: () => void;
  onSkip: () => void;
};

/**
 * Fullscreen breath-in/out prologue. Plays 3 cycles, then a welcome card,
 * then calls onDone. The parent decides what to render next.
 */
export function BreathPrologue({ onDone, onSkip }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "breath", cycle: 0, step: "in" });

  useEffect(() => {
    if (phase.kind === "done") return;
    let t: ReturnType<typeof setTimeout>;
    if (phase.kind === "breath") {
      if (phase.step === "in") {
        t = setTimeout(
          () => setPhase({ kind: "breath", cycle: phase.cycle, step: "out" }),
          IN_MS,
        );
      } else {
        const nextCycle = phase.cycle + 1;
        t = setTimeout(() => {
          if (nextCycle >= CYCLES) setPhase({ kind: "welcome" });
          else setPhase({ kind: "breath", cycle: nextCycle, step: "in" });
        }, OUT_MS);
      }
    } else if (phase.kind === "welcome") {
      t = setTimeout(() => {
        setPhase({ kind: "done" });
        onDone();
      }, WELCOME_MS);
    }
    return () => clearTimeout(t);
  }, [phase, onDone]);

  // Orb scale: breath in → grow to 1.08 over 4s; breath out → shrink to 1 over 6s
  const orbScale =
    phase.kind === "breath" ? (phase.step === "in" ? 1.08 : 1) : 1;
  const orbDuration =
    phase.kind === "breath" ? (phase.step === "in" ? IN_MS : OUT_MS) / 1000 : 1;

  const text =
    phase.kind === "breath"
      ? phase.step === "in"
        ? "Adem in…"
        : "En uit."
      : phase.kind === "welcome"
        ? "Welkom bij HoofdRust."
        : "";

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <button
        type="button"
        onClick={onSkip}
        className="absolute right-5 top-5 text-xs tracking-wide text-muted-foreground/80 hover:text-foreground"
      >
        Sla over
      </button>

      <motion.div
        animate={{ scale: orbScale }}
        transition={{
          duration: orbDuration,
          ease: [0.4, 0, 0.2, 1],
        }}
      >
        <MiniOrb size={120} glow />
      </motion.div>

      <div className="mt-12 h-16 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={`${phase.kind}-${"step" in phase ? phase.step : ""}-${"cycle" in phase ? phase.cycle : ""}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            className={
              phase.kind === "welcome"
                ? "text-3xl text-foreground"
                : "text-xl text-foreground/80"
            }
            style={{ fontFamily: "var(--font-display)" }}
          >
            {text}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

const STORAGE_KEY = "hoofdrust:breath-prologue-seen";

export function useBreathPrologueGate() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSeen(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const markSeen = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setSeen(true);
  };

  return { seen, markSeen };
}
