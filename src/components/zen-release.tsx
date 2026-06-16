import { AnimatePresence, motion } from "motion/react";

type Phase = "idle" | "bloom" | "silence";

export function ZenRelease({ phase }: { phase: Phase }) {
  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          key="zen"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {phase === "bloom" && (
            <motion.span
              aria-hidden
              className="absolute rounded-full"
              style={{
                width: 360,
                height: 360,
                background:
                  "radial-gradient(circle at 35% 30%, #ffffff 0%, #F0E1D4 25%, #E8D4DC 55%, #C8B6D9 90%)",
                filter: "blur(2px)",
                boxShadow:
                  "0 0 120px rgba(200,182,217,0.6), 0 0 240px rgba(232,212,220,0.45)",
              }}
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 1.35, opacity: 0 }}
              transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1] }}
            />
          )}
          {phase === "silence" && (
            <motion.p
              className="font-display text-4xl tracking-[-0.02em] text-foreground"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              Losgelaten.
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
