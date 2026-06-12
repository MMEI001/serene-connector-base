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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { speakText, setVoicePreferenceCache, setVoiceIdCache, DEFAULT_VOICE_ID } from "@/lib/speak";

const VOICE_OPTIONS = [
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", desc: "warm en sereen" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", desc: "vriendelijk en kalm" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", desc: "rustig en intiem" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", desc: "diep en geruststellend" },
  { id: "onwK4e9ZLuTAKqWW03F0", name: "Daniel", desc: "neutraal en rustig" },
];
const SAMPLE_TEXT = "Hallo, ik ben er voor je.";

export const Route = createFileRoute("/profiel")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Profiel" }] }),
  component: ProfilePage,
});

type Prefs = {
  primary_goal: string[];
  main_difficulty: string[];
  hard_moment_of_day: string[];
  preferred_help_area: string[];
  support_style: string | null;
  overstimulation_level: string | null;
  suggestion_count_preference: string | null;
  reminder_style: string | null;
  planning_style: string | null;
};

type MultiField = {
  kind: "multi";
  key: "primary_goal" | "main_difficulty" | "hard_moment_of_day" | "preferred_help_area";
  label: string;
  options: string[];
};
type SingleField = {
  kind: "single";
  key: "support_style" | "overstimulation_level" | "suggestion_count_preference" | "reminder_style" | "planning_style";
  label: string;
  options: string[];
};
type Field = MultiField | SingleField;

const FIELDS: Field[] = [
  { kind: "multi", key: "primary_goal", label: "Wat zou HoofdRust voor jou mogen doen?",
    options: ["Meer overzicht", "Minder in mijn hoofd", "Beter plannen", "Rust vinden", "Anders"] },
  { kind: "single", key: "support_style", label: "Hoe wil je dat ik je help?",
    options: ["Rustig en zacht", "Kort en duidelijk", "Meedenkend", "Zo min mogelijk"] },
  { kind: "multi", key: "main_difficulty", label: "Waar loop je het meest tegenaan?",
    options: ["Te veel tegelijk", "Vergeten van afspraken", "Niet kunnen loslaten", "Beginnen aan dingen", "Anders"] },
  { kind: "single", key: "overstimulation_level", label: "Hoe snel raak je overprikkeld?",
    options: ["Bijna nooit", "Soms", "Vaak", "Heel vaak"] },
  { kind: "multi", key: "hard_moment_of_day", label: "Welk moment van de dag is voor jou het lastigst?",
    options: ["Ochtend", "Middag", "Avond", "Wisselt", "Geen specifiek moment"] },
  { kind: "single", key: "suggestion_count_preference", label: "Hoeveel voorstellen wil je per keer zien?",
    options: ["Eén tegelijk", "Twee of drie", "Maakt me niet uit"] },
  { kind: "multi", key: "preferred_help_area", label: "Waar wil je hulp bij?",
    options: ["Plannen", "Reminders", "Loslaten", "Notities", "Alles"] },
  { kind: "single", key: "reminder_style", label: "Hoe wil je herinnerd worden?",
    options: ["Zacht", "Duidelijk", "Zo min mogelijk"] },
  { kind: "single", key: "planning_style", label: "Hoe plan je het liefst?",
    options: ["Vaste tijden", "Flexibel", "Per dag bekijken"] },
];

const empty: Prefs = {
  primary_goal: [],
  main_difficulty: [],
  hard_moment_of_day: [],
  preferred_help_area: [],
  support_style: null,
  overstimulation_level: null,
  suggestion_count_preference: null,
  reminder_style: null,
  planning_style: null,
};

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select(
          "primary_goal, support_style, main_difficulty, overstimulation_level, hard_moment_of_day, suggestion_count_preference, preferred_help_area, reminder_style, planning_style, voice_enabled" as "*",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as typeof data & { voice_enabled?: boolean | null };
        setPrefs({
          primary_goal: d.primary_goal ?? [],
          main_difficulty: d.main_difficulty ?? [],
          hard_moment_of_day: d.hard_moment_of_day ?? [],
          preferred_help_area: d.preferred_help_area ?? [],
          support_style: d.support_style ?? null,
          overstimulation_level: d.overstimulation_level ?? null,
          suggestion_count_preference: d.suggestion_count_preference ?? null,
          reminder_style: d.reminder_style ?? null,
          planning_style: d.planning_style ?? null,
        });
        const v = Boolean(d.voice_enabled);
        setVoiceEnabled(v);
        setVoicePreferenceCache(v);
      }
      setLoading(false);
    })();
  }, [user]);

  async function handleVoiceToggle(next: boolean) {
    if (!user || voiceSaving) return;
    setVoiceSaving(true);
    const previous = voiceEnabled;
    setVoiceEnabled(next);
    const { error } = await supabase
      .from("user_profiles")
      .update({ voice_enabled: next } as never)
      .eq("user_id", user.id);
    setVoiceSaving(false);
    if (error) {
      setVoiceEnabled(previous);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    setVoicePreferenceCache(next);
    if (next) {
      void speakText("Fijn dat je naar me wilt luisteren.", { force: true });
    }
  }

  function toggleMulti(key: MultiField["key"], value: string) {
    setPrefs((p) => {
      const current = p[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...p, [key]: next };
    });
  }

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

        <div className="mt-6 space-y-6">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))
            : FIELDS.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label className="text-sm text-foreground">{f.label}</Label>
                  {f.kind === "multi" ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Meerdere antwoorden mogelijk
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {f.options.map((opt) => {
                          const selected = prefs[f.key].includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleMulti(f.key, opt)}
                              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border/60 bg-background text-muted-foreground hover:bg-card"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
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
                  )}
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
        <h2 className="text-base text-foreground">Stem</h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <Label htmlFor="voice-toggle" className="text-sm text-foreground">
            Laat HoofdRust voorlezen
          </Label>
          <Switch
            id="voice-toggle"
            checked={voiceEnabled}
            disabled={loading || voiceSaving}
            onCheckedChange={handleVoiceToggle}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          De app leest belangrijke meldingen rustig voor.
        </p>
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
