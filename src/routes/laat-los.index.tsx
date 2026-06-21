import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { VoiceOrb } from "@/components/voice-orb";
import { ZenRelease } from "@/components/zen-release";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const Route = createFileRoute("/laat-los/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Laat los" }] }),
  component: LetGoPage,
});

type Item = {
  id: string;
  content: string;
  status: "active" | "archived" | "processed";
  created_at: string;
};

type Phase = "idle" | "bloom" | "silence";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Goedenacht";
  if (h < 12) return "Goedemorgen";
  if (h < 18) return "Goedemiddag";
  if (h < 22) return "Goedenavond";
  return "Goedenacht";
}

function formatCreated(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const same =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (same) return "vandaag";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

function preview(text: string) {
  const f = text.split("\n")[0]?.trim() ?? "";
  return f.length <= 100 ? f : f.slice(0, 97) + "…";
}

const voiceHints = [
  "Iets loslaten",
  "Een notitie maken",
  "Mijn agenda",
];

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function LetGoPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");

  const loadItems = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("let_go_items")
      .select("id, content, status, created_at")
      .eq("user_id", user.id)
      .in("status", ["active", "archived"])
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Item[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const activeItems = items.filter((i) => i.status === "active");
  const archived = items.filter((i) => i.status === "archived");

  function runZenRelease() {
    vibrate([100, 30, 200]);
    setPhase("bloom");
    window.setTimeout(() => setPhase("silence"), 1400);
    window.setTimeout(() => setPhase("idle"), 1400 + 3000);
  }

  // Demo-friendly hook for callers: window-level trigger of the zen release.
  useEffect(() => {
    const onRelease = () => runZenRelease();
    window.addEventListener("hoofdrust:release", onRelease);
    return () => window.removeEventListener("hoofdrust:release", onRelease);
  });

  const period =
    typeof document !== "undefined"
      ? document.documentElement.dataset.period
      : undefined;
  const onNight = period === "night";

  return (
    <AppShell>
      <div className="flex flex-col items-center text-center">
        <h1 className="font-display text-[34px] leading-tight tracking-[-0.02em] text-foreground">
          {greeting()}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Wat wil je loslaten?
        </p>

        <div className="my-10">
          <VoiceOrb
            onCompleted={() => {
              runZenRelease();
              loadItems();
            }}
          />
        </div>

        <p
          className={`mt-1 text-xs ${
            onNight ? "text-white/55" : "text-[#B5A99E]"
          }`}
        >
          Wat je hier zegt blijft bij jou
        </p>

        {/* context hint — wat je kunt zeggen tegen de orb */}
        <div className="mt-8 flex flex-col items-center gap-3 px-4">
          <span className="text-xs italic text-muted-foreground/70">
            Zeg bijvoorbeeld
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {voiceHints.map((h) => (
              <span
                key={h}
                className="rounded-full bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/65 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                {h}
              </span>
            ))}
          </div>
        </div>

        <Link
          to="/laat-los/nieuw"
          className="mt-6 text-xs text-muted-foreground/80 underline-offset-4 hover:underline hover:text-foreground"
        >
          Liever typen?
        </Link>
      </div>

      {/* recent items */}
      {!loading && (activeItems.length > 0 || archived.length > 0) && (
        <div className="mt-14 space-y-8">
          {activeItems.length > 0 && (
            <section>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Recent losgelaten
              </h2>
              <ItemList list={activeItems.slice(0, 5)} />
            </section>
          )}

          {archived.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
                Gearchiveerd ({archived.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <ItemList list={archived} muted />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      <ZenRelease phase={phase} />
    </AppShell>
  );
}

function ItemList({ list, muted }: { list: Item[]; muted?: boolean }) {
  return (
    <div className="space-y-3">
      {list.map((i, idx) => (
        <motion.div
          key={i.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: idx * 0.04,
            duration: 0.5,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          <Link
            to="/laat-los/$id"
            params={{ id: i.id }}
            className={`block surface-glass rounded-[20px] p-5 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 ${
              muted ? "opacity-70" : ""
            }`}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {preview(i.content)}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatCreated(i.created_at)}
            </p>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
