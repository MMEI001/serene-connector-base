import { useEffect, useMemo, useState } from "react";

const RECENT_KEY = "hoofdrust:greetings-recent";
const LAST_OPEN_KEY = "hoofdrust:last-open";
const OPEN_COUNT_KEY = "hoofdrust:open-count";

type Period = "morning" | "afternoon" | "evening" | "night";

function currentPeriod(): Period {
  const h = new Date().getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

const POOL: Record<Period, string[]> = {
  morning: [
    "Goedemorgen. Wat speelt er in je hoofd vandaag?",
    "Een nieuwe dag. Hoe begin jij hem?",
    "Welkom terug. Wat heb je vandaag nodig?",
  ],
  afternoon: [
    "Hoi. Even pauzeren?",
    "Welkom terug. Hoe gaat je dag tot nu toe?",
    "Tijd voor een rustmoment.",
  ],
  evening: [
    "Goedenavond. Wat wil je loslaten voor je gaat slapen?",
    "De dag zit erop. Hoe voelt het?",
    "Welkom terug. Even tot rust komen?",
  ],
  night: [
    "Nog wakker? Ik luister.",
    "De wereld is stil. Wat houdt jou wakker?",
  ],
};

const RECENT_VARIANTS = ["Daar ben je weer.", "Welkom terug."];
const FREQUENT_VARIANTS = ["Fijn dat je terugkomt.", "Ik ben er."];

function pickGreeting(): string {
  const now = Date.now();
  let recent: string[] = [];
  try {
    recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    recent = [];
  }
  const lastOpen = Number(localStorage.getItem(LAST_OPEN_KEY) ?? 0);
  const today = new Date().toDateString();
  const stored = localStorage.getItem(OPEN_COUNT_KEY);
  let count = 0;
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { date: string; count: number };
      if (parsed.date === today) count = parsed.count;
    } catch {
      /* noop */
    }
  }

  let pool: string[];
  if (lastOpen && now - lastOpen < 60 * 60 * 1000) {
    pool = RECENT_VARIANTS;
  } else if (count >= 3) {
    pool = FREQUENT_VARIANTS;
  } else {
    pool = POOL[currentPeriod()];
  }

  const filtered = pool.filter((g) => !recent.includes(g));
  const choice = (filtered.length ? filtered : pool)[
    Math.floor(Math.random() * (filtered.length || pool.length))
  ];

  const nextRecent = [choice, ...recent].slice(0, 3);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
    localStorage.setItem(LAST_OPEN_KEY, String(now));
    localStorage.setItem(
      OPEN_COUNT_KEY,
      JSON.stringify({ date: today, count: count + 1 }),
    );
  } catch {
    /* noop */
  }
  return choice;
}

type Props = {
  onDone?: () => void;
  speed?: number;
};

export function TypewriterGreeting({ onDone, speed = 40 }: Props) {
  const text = useMemo(() => pickGreeting(), []);
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(text.length);
      setDone(true);
      onDone?.();
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) {
        window.clearInterval(id);
        setDone(true);
        onDone?.();
      }
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, onDone]);

  const skip = () => {
    if (done) return;
    setShown(text.length);
    setDone(true);
    onDone?.();
  };

  return (
    <button
      type="button"
      onClick={skip}
      aria-label="Begroeting"
      className="block w-full max-w-md cursor-default select-text bg-transparent text-center"
    >
      <span className="font-display text-xl leading-relaxed tracking-[-0.01em] text-foreground/90">
        {text.slice(0, shown)}
        {!done && (
          <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-foreground/60 align-middle" style={{ height: "1em" }} />
        )}
      </span>
    </button>
  );
}
