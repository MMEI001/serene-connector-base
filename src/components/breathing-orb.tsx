import { motion } from "motion/react";

export type OrbMode = "idle" | "listening" | "processing" | "speaking" | "bloom";

type Props = {
  size?: number;
  /** Voorkeurs-API: expliciete modus. Overschrijft `recording`/`blooming`. */
  mode?: OrbMode;
  /** Legacy: behandeld als listening. */
  recording?: boolean;
  /** Legacy: behandeld als bloom. */
  blooming?: boolean;
  onTap?: () => void;
  ariaLabel?: string;
};

// Per-modus bewegingsprofielen. Alles bewust traag en zacht — "HoofdRust ademt mee".
// Geen rode/coral indicator; alleen subtiele warmte-shift in de gloed.
const profiles: Record<
  OrbMode,
  {
    scale: number[];
    duration: number;
    glowScale: number[];
    glowOpacity: number[];
    ease: [number, number, number, number];
  }
> = {
  idle: {
    scale: [1, 1.022, 1],
    duration: 6.5,
    glowScale: [1, 1.035, 1],
    glowOpacity: [0.78, 0.86, 0.78],
    ease: [0.45, 0.05, 0.55, 0.95],
  },
  listening: {
    // Iets duidelijker ademen; nog steeds traag en zacht.
    scale: [1, 1.06, 1],
    duration: 3.6,
    glowScale: [1, 1.1, 1],
    glowOpacity: [0.85, 1, 0.85],
    ease: [0.42, 0, 0.58, 1],
  },
  processing: {
    // Trage organische "wave": twee zwellingen per cyclus, niet symmetrisch.
    scale: [1, 1.035, 1.008, 1.05, 1],
    duration: 5.5,
    glowScale: [1, 1.08, 1.02, 1.12, 1],
    glowOpacity: [0.82, 0.95, 0.88, 1, 0.82],
    ease: [0.4, 0, 0.2, 1],
  },
  speaking: {
    // Lichte ritmische beweging, ongeveer in spreektempo (~120ms per fase).
    scale: [1, 1.028, 1.012, 1.035, 1.015, 1],
    duration: 1.9,
    glowScale: [1, 1.06, 1.02, 1.07, 1.03, 1],
    glowOpacity: [0.85, 0.96, 0.88, 1, 0.9, 0.85],
    ease: [0.45, 0.05, 0.55, 0.95],
  },
  bloom: {
    scale: [1, 1.28],
    duration: 0.9,
    glowScale: [1, 1.55],
    glowOpacity: [0.85, 0.35],
    ease: [0.2, 0.8, 0.2, 1],
  },
};

export function BreathingOrb({
  size = 240,
  mode,
  recording = false,
  blooming = false,
  onTap,
  ariaLabel = "Tik om te spreken",
}: Props) {
  const resolved: OrbMode = mode ?? (blooming ? "bloom" : recording ? "listening" : "idle");
  const p = profiles[resolved];
  const repeat = resolved === "bloom" ? 0 : Infinity;

  // Eén kalme cream/lavender gradient voor álle states — geen rode/coral
  // opname-indicator. Bij listening en speaking wordt de warmte iets opgevoerd
  // via de buitenste gloed, niet via een nieuwe kleur op de orb zelf.
  const orbGradient =
    "radial-gradient(circle at 32% 28%, #ffffff 0%, #F0E1D4 22%, #E8D4DC 55%, #C8B6D9 90%)";

  const glowBackground =
    resolved === "listening" || resolved === "speaking"
      ? "radial-gradient(circle at 30% 30%, rgba(212,194,224,0.62), rgba(238,218,224,0.42) 45%, rgba(244,230,218,0.16) 70%, transparent 82%)"
      : "radial-gradient(circle at 30% 30%, rgba(200,182,217,0.55), rgba(232,212,220,0.35) 45%, rgba(240,225,212,0.12) 70%, transparent 82%)";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={ariaLabel}
      className="group relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      style={{ width: size, height: size }}
    >
      {/* outer glow */}
      <motion.span
        aria-hidden
        className="absolute inset-[-18%] rounded-full"
        style={{
          background: glowBackground,
          filter: "blur(28px)",
        }}
        animate={{ scale: p.glowScale, opacity: p.glowOpacity }}
        transition={{
          duration: p.duration,
          repeat,
          ease: p.ease,
          repeatType: "loop",
        }}
      />
      {/* main orb */}
      <motion.span
        aria-hidden
        className="relative block rounded-full"
        style={{
          width: "82%",
          height: "82%",
          background: orbGradient,
          boxShadow:
            "inset -22px -32px 56px rgba(139, 126, 115, 0.20), inset 22px 22px 44px rgba(255,255,255,0.6), 0 24px 64px rgba(200,182,217,0.45), 0 0 80px rgba(232,212,220,0.35)",
        }}
        animate={{ scale: p.scale }}
        transition={{
          duration: p.duration,
          repeat,
          ease: p.ease,
          repeatType: "loop",
        }}
      />
      {/* highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[26%] h-[18%] w-[34%] -translate-x-1/2 rounded-full bg-white/60 blur-2xl"
      />
    </button>
  );
}
