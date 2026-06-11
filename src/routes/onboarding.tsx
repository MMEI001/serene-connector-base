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

type Answers = {
  primary_goal: string | null;
  support_style: string | null;
  main_difficulty: string | null;
  overstimulation_level: string | null;
  hard_moment_of_day: string | null;
  suggestion_count_preference: string | null;
};

const steps: {
  key: keyof Answers;
  question: string;
  options: string[];
}[] = [
  {
    key: "primary_goal",
    question: "Wat zou HoofdRust voor jou mogen doen?",
    options: ["Meer overzicht", "Minder in mijn hoofd", "Beter plannen", "Rust vinden", "Anders"],
  },
  {
    key: "support_style",
    question: "Hoe wil je dat ik je help?",
    options: ["Rustig en zacht", "Kort en duidelijk", "Meedenkend", "Zo min mogelijk"],
  },
  {
    key: "main_difficulty",
    question: "Waar loop je het meest tegenaan?",
    options: ["Te veel tegelijk", "Vergeten van afspraken", "Niet kunnen loslaten", "Beginnen aan dingen", "Anders"],
  },
  {
    key: "overstimulation_level",
    question: "Hoe snel raak je overprikkeld?",
    options: ["Bijna nooit", "Soms", "Vaak", "Heel vaak"],
  },
  {
    key: "hard_moment_of_day",
    question: "Welk moment van de dag is voor jou het lastigst?",
    options: ["Ochtend", "Middag", "Avond", "Wisselt", "Geen specifiek moment"],
  },
  {
    key: "suggestion_count_preference",
    question: "Hoeveel voorstellen wil je per keer zien?",
    options: ["Eén tegelijk", "Twee of drie", "Maakt me niet uit"],
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [stepIndex, setStepIndex] = useState(-1); // -1 = welcome, steps.length = done
  const [answers, setAnswers] = useState<Answers>({
    primary_goal: null,
    support_style: null,
    main_difficulty: null,
    overstimulation_level: null,
    hard_moment_of_day: null,
    suggestion_count_preference: null,
  });
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

  async function handleSkip() {
    await saveAndFinish({
      primary_goal: null,
      support_style: null,
      main_difficulty: null,
      overstimulation_level: null,
      hard_moment_of_day: null,
      suggestion_count_preference: null,
    });
  }

  function handlePick(value: string) {
    const step = steps[stepIndex];
    const next = { ...answers, [step.key]: value };
    setAnswers(next);
    if (stepIndex === steps.length - 1) {
      void saveAndFinish(next);
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
                onClick={handleSkip}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Overslaan
              </button>
            </div>
          </div>
        )}

        {stepIndex >= 0 && stepIndex < steps.length && (
          <div className="m-auto w-full">
            <p className="text-center text-xs uppercase tracking-wide text-muted-foreground">
              Stap {stepIndex + 1} van {steps.length}
            </p>
            <h2 className="mt-4 text-center text-2xl text-foreground">
              {steps[stepIndex].question}
            </h2>
            <div className="mt-8 space-y-3">
              {steps[stepIndex].options.map((opt) => {
                const selected = answers[steps[stepIndex].key] === opt;
                return (
                  <Card
                    key={opt}
                    onClick={() => handlePick(opt)}
                    className={`cursor-pointer rounded-2xl border-border/60 bg-card/80 p-5 text-base shadow-sm transition-colors hover:bg-card ${
                      selected ? "border-primary" : ""
                    }`}
                  >
                    {opt}
                  </Card>
                );
              })}
            </div>
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => (stepIndex === 0 ? setStepIndex(-1) : setStepIndex(stepIndex - 1))}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Terug
              </button>
              <button
                type="button"
                onClick={handleSkip}
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
