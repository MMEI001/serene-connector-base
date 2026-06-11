import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Welkom" }] }),
  component: OnboardingPage,
});

type MultiKey =
  | "primary_goal"
  | "main_difficulty"
  | "hard_moment_of_day"
  | "preferred_help_area";
type SingleKey =
  | "support_style"
  | "overstimulation_level"
  | "suggestion_count_preference";

type Answers = {
  primary_goal: string[];
  main_difficulty: string[];
  hard_moment_of_day: string[];
  preferred_help_area: string[];
  support_style: string | null;
  overstimulation_level: string | null;
  suggestion_count_preference: string | null;
};

const emptyAnswers: Answers = {
  primary_goal: [],
  main_difficulty: [],
  hard_moment_of_day: [],
  preferred_help_area: [],
  support_style: null,
  overstimulation_level: null,
  suggestion_count_preference: null,
};

type Step =
  | { kind: "multi"; key: MultiKey; question: string; options: string[] }
  | { kind: "single"; key: SingleKey; question: string; options: string[] };

const steps: Step[] = [
  {
    kind: "multi",
    key: "primary_goal",
    question: "Wat zou HoofdRust voor jou mogen doen?",
    options: ["Meer overzicht", "Minder in mijn hoofd", "Beter plannen", "Rust vinden", "Anders"],
  },
  {
    kind: "single",
    key: "support_style",
    question: "Hoe wil je dat ik je help?",
    options: ["Rustig en zacht", "Kort en duidelijk", "Meedenkend", "Zo min mogelijk"],
  },
  {
    kind: "multi",
    key: "main_difficulty",
    question: "Waar loop je het meest tegenaan?",
    options: ["Te veel tegelijk", "Vergeten van afspraken", "Niet kunnen loslaten", "Beginnen aan dingen", "Anders"],
  },
  {
    kind: "single",
    key: "overstimulation_level",
    question: "Hoe snel raak je overprikkeld?",
    options: ["Bijna nooit", "Soms", "Vaak", "Heel vaak"],
  },
  {
    kind: "multi",
    key: "hard_moment_of_day",
    question: "Welk moment van de dag is voor jou het lastigst?",
    options: ["Ochtend", "Middag", "Avond", "Wisselt", "Geen specifiek moment"],
  },
  {
    kind: "multi",
    key: "preferred_help_area",
    question: "Waar wil je hulp bij?",
    options: ["Plannen", "Reminders", "Loslaten", "Notities", "Alles"],
  },
  {
    kind: "single",
    key: "suggestion_count_preference",
    question: "Hoeveel voorstellen wil je per keer zien?",
    options: ["Eén tegelijk", "Twee of drie", "Maakt me niet uit"],
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [stepIndex, setStepIndex] = useState(-1);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function saveAndFinish(finalAnswers: Answers) {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await supabase.from("user_profiles").insert({
      user_id: user.id,
      ...finalAnswers,
    });
    setSaving(false);
    if (error) {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    setStepIndex(steps.length);
  }

  async function handleSkipAll() {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .insert({ user_id: user.id });
    setSaving(false);
    if (error) {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    setStepIndex(steps.length);
  }

  function goNext() {
    if (stepIndex === steps.length - 1) {
      void saveAndFinish(answers);
    } else {
      setStepIndex(stepIndex + 1);
    }
  }

  function toggleMulti(key: MultiKey, value: string) {
    setAnswers((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  function pickSingle(key: SingleKey, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (stepIndex === steps.length - 1) {
      void saveAndFinish({ ...answers, [key]: value });
    } else {
      setStepIndex(stepIndex + 1);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-primary/40" />
      </div>
    );
  }

  const current = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null;
  const canContinue =
    current?.kind === "multi" ? answers[current.key].length > 0 : true;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-10">
        {stepIndex === -1 && (
          <div className="m-auto text-center">
            <h1 className="text-3xl text-foreground">Welkom bij HoofdRust</h1>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              We stellen je een paar rustige vragen, zodat de app aansluit bij wat jij nodig hebt.
              Je kunt alles later aanpassen.
            </p>
            <Button
              size="lg"
              className="mt-8 rounded-full px-8"
              onClick={() => setStepIndex(0)}
            >
              Beginnen
            </Button>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleSkipAll}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Overslaan
              </button>
            </div>
          </div>
        )}

        {current && (
          <div className="m-auto w-full">
            <p className="text-center text-xs uppercase tracking-wide text-muted-foreground">
              Stap {stepIndex + 1} van {steps.length}
            </p>
            <h2 className="mt-4 text-center text-2xl text-foreground">
              {current.question}
            </h2>
            {current.kind === "multi" && (
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Meerdere antwoorden mogelijk
              </p>
            )}

            <div className="mt-8 space-y-3">
              {current.options.map((opt) => {
                const selected =
                  current.kind === "multi"
                    ? answers[current.key].includes(opt)
                    : answers[current.key] === opt;
                return (
                  <Card
                    key={opt}
                    onClick={() =>
                      current.kind === "multi"
                        ? toggleMulti(current.key, opt)
                        : pickSingle(current.key, opt)
                    }
                    className={`cursor-pointer rounded-2xl border-border/60 bg-card/80 p-5 text-base shadow-sm transition-colors hover:bg-card ${
                      selected ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{opt}</span>
                      {selected && (
                        <span className="text-xs text-primary">✓</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {current.kind === "multi" && (
              <Button
                size="lg"
                disabled={!canContinue || saving}
                onClick={goNext}
                className="mt-6 w-full rounded-full"
              >
                {stepIndex === steps.length - 1 ? "Klaar" : "Volgende"}
              </Button>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => (stepIndex === 0 ? setStepIndex(-1) : setStepIndex(stepIndex - 1))}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Terug
              </button>
              <button
                type="button"
                onClick={handleSkipAll}
                disabled={saving}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Overslaan
              </button>
            </div>
          </div>
        )}

        {stepIndex === steps.length && (
          <div className="m-auto text-center">
            <h1 className="text-3xl text-foreground">Bedankt</h1>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">We zijn er voor je.</p>
            <Button
              size="lg"
              className="mt-8 rounded-full px-8"
              onClick={() => navigate({ to: "/" })}
            >
              Naar mijn dashboard
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
