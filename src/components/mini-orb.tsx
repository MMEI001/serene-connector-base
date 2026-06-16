type Props = {
  size?: number;
  breathing?: boolean;
  glow?: boolean;
  className?: string;
};

/**
 * MiniOrb — the iridescent orb used as a brand mark, avatar placeholder
 * and inline loading indicator. Same gradient as the big BreathingOrb but
 * static by default.
 */
export function MiniOrb({
  size = 32,
  breathing = false,
  glow = false,
  className = "",
}: Props) {
  return (
    <span
      aria-hidden
      className={`relative inline-block rounded-full ${
        breathing ? "animate-breathe-slow" : ""
      } ${className}`}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 32% 28%, #ffffff 0%, #F0E1D4 22%, #E8D4DC 55%, #C8B6D9 92%)",
        boxShadow: glow
          ? "inset -4px -6px 10px rgba(139,126,115,0.18), inset 4px 4px 8px rgba(255,255,255,0.6), 0 4px 18px rgba(200,182,217,0.35)"
          : "inset -2px -3px 6px rgba(139,126,115,0.16), inset 2px 2px 5px rgba(255,255,255,0.6)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[22%] h-[18%] w-[32%] -translate-x-1/2 rounded-full bg-white/70 blur-[3px]"
      />
    </span>
  );
}
