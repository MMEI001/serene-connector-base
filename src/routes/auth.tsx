import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useHaptic } from "@/lib/use-haptic";
import { MiniOrb } from "@/components/mini-orb";
import { BreathPrologue, useBreathPrologueGate } from "@/components/breath-prologue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [{ title: "HoofdRust — Inloggen" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const haptic = useHaptic();
  const { session, loading } = useAuth();
  const { seen, markSeen } = useBreathPrologueGate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [session, loading, navigate]);

  const showPrologue = seen === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        const userId = data.user?.id;
        if (userId) {
          const { error: pErr } = await supabase
            .from("profiles")
            .insert({ id: userId, display_name: "" });
          if (pErr && pErr.code !== "23505") {
            console.error("[profiles insert]", pErr);
          }
        }
        if (data.session) {
          toast.success("Welkom bij HoofdRust");
          navigate({ to: "/" });
        } else {
          toast.success("Bevestig je e-mail om in te loggen");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Fijn je terug te zien");
        navigate({ to: "/" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Er ging iets mis";
      console.error("[auth]", err);
      haptic.error();
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <AnimatePresence>
        {showPrologue && (
          <BreathPrologue onDone={markSeen} onSkip={markSeen} />
        )}
      </AnimatePresence>

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{
          opacity: showPrologue ? 0 : 1,
          y: showPrologue ? 12 : 0,
        }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5">
            <MiniOrb size={80} glow />
          </div>
          <h1
            className="text-3xl text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            HoofdRust
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Een rustige plek voor je gedachten.
          </p>
        </div>

        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl"
                placeholder="jij@voorbeeld.nl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl"
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full rounded-full"
              size="lg"
            >
              {busy
                ? "Een moment…"
                : mode === "login"
                  ? "Inloggen"
                  : "Account aanmaken"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "login"
              ? "Nog geen account? Maak er een aan"
              : "Heb je al een account? Log in"}
          </button>
        </Card>
      </motion.div>
    </div>
  );
}
