import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/profiel")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Profiel" }] }),
  component: ProfilePage,
});

type Prefs = {
  primary_goal: string | null;
  support_style: string | null;
  main_difficulty: string | null;
  overstimulation_level: string | null;
  hard_moment_of_day: string | null;
  suggestion_count_preference: string | null;
  preferred_help_area: string | null;
  reminder_style: string | null;
  planning_style: string | null;
};

const FIELDS: { key: keyof Prefs; label: string; options: string[] }[] = [
  {
    key: "primary_goal",
    label: "Wat zou HoofdRust voor jou mogen doen?",
    options: ["Meer overzicht", "Minder in mijn hoofd", "Beter plannen", "Rust vinden", "Anders"],
  },
  {
    key: "support_style",
    label: "Hoe wil je dat ik je help?",
    options: ["Rustig en zacht", "Kort en duidelijk", "Meedenkend", "Zo min mogelijk"],
  },
  {
    key: "main_difficulty",
    label: "Waar loop je het meest tegenaan?",
    options: ["Te veel tegelijk", "Vergeten van afspraken", "Niet kunnen loslaten", "Beginnen aan dingen", "Anders"],
  },
  {
    key: "overstimulation_level",
    label: "Hoe snel raak je overprikkeld?",
    options: ["Bijna nooit", "Soms", "Vaak", "Heel vaak"],
  },
  {
    key: "hard_moment_of_day",
    label: "Welk moment van de dag is voor jou het lastigst?",
    options: ["Ochtend", "Middag", "Avond", "Wisselt", "Geen specifiek moment"],
  },
  {
    key: "suggestion_count_preference",
    label: "Hoeveel voorstellen wil je per keer zien?",
    options: ["Eén tegelijk", "Twee of drie", "Maakt me niet uit"],
  },
  {
    key: "preferred_help_area",
    label: "Waar wil je hulp bij?",
    options: ["Plannen", "Reminders", "Loslaten", "Notities", "Alles"],
  },
  {
    key: "reminder_style",
    label: "Hoe wil je herinnerd worden?",
    options: ["Zacht", "Duidelijk", "Zo min mogelijk"],
  },
  {
    key: "planning_style",
    label: "Hoe plan je het liefst?",
    options: ["Vaste tijden", "Flexibel", "Per dag bekijken"],
  },
];

const empty: Prefs = {
  primary_goal: null,
  support_style: null,
  main_difficulty: null,
  overstimulation_level: null,
  hard_moment_of_day: null,
  suggestion_count_preference: null,
  preferred_help_area: null,
  reminder_style: null,
  planning_style: null,
};

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select(
          "primary_goal, support_style, main_difficulty, overstimulation_level, hard_moment_of_day, suggestion_count_preference, preferred_help_area, reminder_style, planning_style",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPrefs({ ...empty, ...data });
      setLoading(false);
    })();
  }, [user]);

  async function handleSave() {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update(prefs)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Je voorkeuren zijn opgeslagen.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl text-foreground">Profiel</h1>
        {user?.email && (
          <p className="mt-2 text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>

      <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
        <h2 className="text-base text-foreground">Mijn voorkeuren</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pas aan wat voor jou werkt. Niks is verplicht.
        </p>

        <div className="mt-6 space-y-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))
            : FIELDS.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label className="text-sm text-foreground">{f.label}</Label>
                  <Select
                    value={prefs[f.key] ?? ""}
                    onValueChange={(v) =>
                      setPrefs((p) => ({ ...p, [f.key]: v || null }))
                    }
                  >
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Maak een keuze" />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className="mt-8 w-full rounded-full"
          size="lg"
        >
          {saving ? "Bezig met opslaan…" : "Wijzigingen opslaan"}
        </Button>
      </Card>

      <Card className="mt-6 rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
        <h2 className="text-base text-foreground">Account</h2>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="mt-4 w-full rounded-full"
        >
          Uitloggen
        </Button>
      </Card>
    </AppShell>
  );
}
