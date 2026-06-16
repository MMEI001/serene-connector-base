import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
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

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Goedenacht";
  if (h < 12) return "Goedemorgen";
  if (h < 18) return "Goedemiddag";
  return "Goedenavond";
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

const suggestions = [
  { label: "Schrijf in plaats daarvan", to: "/laat-los/nieuw" },
  { label: "Bekijk eerdere", to: "/laat-los" },
  { label: "Stilte modus", to: "/laat-los" },
] as const;

function LetGoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("let_go_items")
        .select("id, content, status, created_at")
        .eq("user_id", user.id)
        .in("status", ["active", "archived"])
        .order("created_at", { ascending: false });
      setItems((data ?? []) as Item[]);
      setLoading(false);
    })();
  }, [user]);

  const activeItems = items.filter((i) => i.status === "active");
  const archived = items.filter((i) => i.status === "archived");

  const handleOrb = () => {
    setActive(true);
    setTimeout(() => navigate({ to: "/laat-los/nieuw" }), 350);
  };

  return (
    <AppShell>
      <div className="flex flex-col items-center text-center">
        <h1 className="font-display text-4xl tracking-[-0.02em] text-foreground">
          {greeting()}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Wat wil je loslaten?
        </p>

        {/* Orb */}
        <button
          type="button"
          onClick={handleOrb}
          aria-label="Tik om te spreken"
          className="relative my-12 flex h-56 w-56 items-center justify-center rounded-full focus:outline-none"
        >
          {/* outer glow */}
          <motion.span
            aria-hidden
            className="absolute inset-[-30px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, rgba(200,182,217,0.55), rgba(232,212,220,0.35) 45%, rgba(240,225,212,0.1) 70%, transparent 80%)",
              filter: "blur(20px)",
            }}
            animate={{ scale: active ? [1, 1.15, 1] : [1, 1.08, 1] }}
            transition={{
              duration: active ? 1.2 : 4,
              repeat: Infinity,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
          {/* main orb */}
          <motion.span
            aria-hidden
            className="relative block h-44 w-44 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, #ffffff 0%, #f0e1d4 25%, #e8d4dc 55%, #c8b6d9 85%)",
              boxShadow:
                "inset -20px -30px 50px rgba(139, 126, 115, 0.18), inset 20px 20px 40px rgba(255,255,255,0.6), 0 20px 60px rgba(200,182,217,0.4)",
            }}
            animate={{ scale: active ? [1, 1.08, 1] : [1, 1.05, 1] }}
            transition={{
              duration: active ? 1.2 : 4,
              repeat: Infinity,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
          {/* highlight */}
          <span
            aria-hidden
            className="absolute left-1/2 top-[28%] h-12 w-20 -translate-x-1/2 rounded-full bg-white/60 blur-xl"
          />
        </button>

        <motion.p
          className="text-sm font-medium tracking-wide text-muted-foreground"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          Tik om te spreken
        </motion.p>

        {/* suggestion pills */}
        <div className="mt-8 -mx-5 w-screen max-w-2xl overflow-x-auto px-5 pb-2">
          <div className="flex gap-2.5 justify-center min-w-min">
            {suggestions.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className="shrink-0 rounded-full bg-white/70 px-4 py-2 text-xs font-medium text-foreground/80 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.06)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.02] active:scale-95"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
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
