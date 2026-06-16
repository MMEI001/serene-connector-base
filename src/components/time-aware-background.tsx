import { useEffect, useState } from "react";

type Period = "morning" | "afternoon" | "evening" | "night";

function getPeriod(d = new Date()): Period {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

const gradients: Record<Period, string> = {
  morning:
    "linear-gradient(180deg, #F0E5E8 0%, #F4EAE4 50%, #F8F0E8 100%)",
  afternoon:
    "linear-gradient(180deg, #EDE4DD 0%, #F5F0EC 50%, #F8F3EE 100%)",
  evening:
    "linear-gradient(180deg, #E8DDD5 0%, #E7DAD2 50%, #E5DCD8 100%)",
  night:
    "linear-gradient(180deg, #3D3540 0%, #34303A 50%, #2D2832 100%)",
};

export function TimeAwareBackground() {
  const [period, setPeriod] = useState<Period>(() => getPeriod());

  useEffect(() => {
    const tick = () => setPeriod(getPeriod());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.period = period;
    return () => {
      delete root.dataset.period;
    };
  }, [period]);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20"
        style={{
          background: gradients[period],
          transition: "background 60s linear",
        }}
      />
      {period === "night" && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.7), transparent 60%)," +
              "radial-gradient(1px 1px at 78% 24%, rgba(255,255,255,0.55), transparent 60%)," +
              "radial-gradient(1.5px 1.5px at 42% 64%, rgba(255,255,255,0.6), transparent 60%)," +
              "radial-gradient(1px 1px at 88% 78%, rgba(255,255,255,0.5), transparent 60%)," +
              "radial-gradient(1px 1px at 28% 88%, rgba(255,255,255,0.5), transparent 60%)," +
              "radial-gradient(1.5px 1.5px at 62% 12%, rgba(255,255,255,0.7), transparent 60%)",
            backgroundSize: "100% 100%",
          }}
        />
      )}
    </>
  );
}
