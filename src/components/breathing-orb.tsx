import { motion } from "motion/react";

type Props = {
  size?: number;
  recording?: boolean;
  blooming?: boolean;
  onTap?: () => void;
  ariaLabel?: string;
};

export function BreathingOrb({
  size = 240,
  recording = false,
  blooming = false,
  onTap,
  ariaLabel = "Tik om te spreken",
}: Props) {
  const cycle = recording ? 2 : 4;
  const scaleSeq = blooming ? [1, 1.3] : recording ? [1, 1.08, 1] : [1, 1.05, 1];
  const duration = blooming ? 0.8 : cycle;
  const repeat = blooming ? 0 : Infinity;

  const orbGradient = recording
    ? "radial-gradient(circle at 32% 28%, #ffffff 0%, #F4D6C8 20%, #E8B5B5 55%, #C8A0C8 90%)"
    : "radial-gradient(circle at 32% 28%, #ffffff 0%, #F0E1D4 22%, #E8D4DC 55%, #C8B6D9 90%)";

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
        className="absolute inset-[-18%] rounded-full transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(200,182,217,0.55), rgba(232,212,220,0.35) 45%, rgba(240,225,212,0.12) 70%, transparent 82%)",
          filter: "blur(28px)",
          opacity: 0.85,
        }}
        animate={{ scale: blooming ? [1, 1.5] : scaleSeq }}
        transition={{
          duration,
          repeat,
          ease: [0.4, 0, 0.2, 1],
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
          transition: "background 600ms cubic-bezier(0.4,0,0.2,1)",
        }}
        animate={{ scale: scaleSeq }}
        transition={{
          duration,
          repeat,
          ease: [0.4, 0, 0.2, 1],
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
