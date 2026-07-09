import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  speakText,
  setVoicePreferenceCache,
  setVoiceIdCache,
  setVoiceQualityCache,
  DEFAULT_VOICE_ID,
  DEFAULT_VOICE_QUALITY,
  type VoiceQuality,
} from "@/lib/speak";
import { notifyRitualChanged, requestRitualPermission, fireRitualNotification } from "@/lib/daily-ritual";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Gender = "v" | "m";
type Accent = "nl" | "int";
type VoiceOption = {
  id: string;
  name: string;
  desc: string;
  gender: Gender;
  accent: Accent;
};

// Accent-label is subjectief per voice; "nl" = klinkt het meest natuurlijk NL,
// "int" = internationaal (kan Vlaams aandoen bij snelle model_flash).
const VOICE_OPTIONS: VoiceOption[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", desc: "warm en helder", gender: "v", accent: "nl" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", desc: "warm en sereen", gender: "v", accent: "int" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", desc: "vriendelijk en kalm", gender: "v", accent: "int" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", desc: "helder en zacht", gender: "v", accent: "nl" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", desc: "warm en rustig", gender: "v", accent: "int" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", desc: "levendig en jong", gender: "v", accent: "int" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", desc: "rustig en intiem", gender: "v", accent: "int" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", desc: "warm en volwassen", gender: "m", accent: "nl" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", desc: "diep en geruststellend", gender: "m", accent: "int" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", desc: "neutraal en rustig", gender: "m", accent: "int" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", desc: "kalm en gedragen", gender: "m", accent: "nl" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", desc: "casual en helder", gender: "m", accent: "int" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", desc: "zacht en vriendelijk", gender: "m", accent: "int" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", desc: "warm en meelevend", gender: "m", accent: "int" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", desc: "rustig en zakelijk", gender: "m", accent: "nl" },
];
const SAMPLE_TEXT = "Hallo, ik ben er voor je. Zullen we samen even naar je dag kijken?";

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
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [voiceQuality, setVoiceQualityState] = useState<VoiceQuality>(DEFAULT_VOICE_QUALITY);
  const [genderFilter, setGenderFilter] = useState<Gender | "all">("all");
  const [accentFilter, setAccentFilter] = useState<Accent | "all">("all");
  const [ritualEnabled, setRitualEnabled] = useState(false);
  const [ritualTime, setRitualTime] = useState("19:30");
  const [ritualSaving, setRitualSaving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showDeniedHelp, setShowDeniedHelp] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  function isIosNonStandalone() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      nav.standalone === true ||
      (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
    return isIos && !standalone;
  }

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    setNotifPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select(
          "primary_goal, support_style, main_difficulty, overstimulation_level, hard_moment_of_day, suggestion_count_preference, preferred_help_area, reminder_style, planning_style, voice_enabled, voice_id, voice_quality, ritual_enabled, ritual_time" as "*",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as typeof data & {
          voice_enabled?: boolean | null;
          voice_id?: string | null;
          voice_quality?: string | null;
          ritual_enabled?: boolean | null;
          ritual_time?: string | null;
        };
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
        const vid = d.voice_id || DEFAULT_VOICE_ID;
        setVoiceId(vid);
        setVoiceIdCache(vid);
        setRitualEnabled(Boolean(d.ritual_enabled));
        setRitualTime(d.ritual_time || "19:30");
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 120);
      const { data } = await supabase
        .from("let_go_items")
        .select("created_at")
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (!data) return;
      const days = new Set(
        data.map((r) => new Date(r.created_at).toDateString()),
      );
      const today = new Date();
      let n = 0;
      const cursor = new Date(today);
      // Allow today OR yesterday as the starting point
      if (!days.has(cursor.toDateString())) {
        cursor.setDate(cursor.getDate() - 1);
        if (!days.has(cursor.toDateString())) {
          setStreak(0);
          return;
        }
      }
      while (days.has(cursor.toDateString())) {
        n += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      setStreak(n);
    })();
  }, [user]);

  async function handleRitualToggle(next: boolean) {
    if (!user || ritualSaving) return;
    if (next) {
      if (typeof window === "undefined" || !("Notification" in window)) {
        if (isIosNonStandalone()) {
          setShowIosHelp(true);
        } else {
          toast.error("Je browser ondersteunt geen meldingen.");
        }
        return;
      }
      if (Notification.permission === "denied") {
        setNotifPermission("denied");
        setShowDeniedHelp(true);
        return;
      }
      setRitualSaving(true);
      try {
        const perm = await requestRitualPermission();
        setNotifPermission(perm);
        if (perm !== "granted") {
          setRitualSaving(false);
          if (perm === "denied") setShowDeniedHelp(true);
          else toast.error("Geen toestemming gegeven voor meldingen.");
          return;
        }
      } catch (err) {
        console.error("[ritual] permission error", err);
        setRitualSaving(false);
        toast.error(err instanceof Error ? err.message : "Onbekende fout bij meldingen.");
        return;
      }
    } else {
      setRitualSaving(true);
    }
    const prev = ritualEnabled;
    setRitualEnabled(next);
    const { error } = await supabase
      .from("user_profiles")
      .update({ ritual_enabled: next } as never)
      .eq("user_id", user.id);
    setRitualSaving(false);
    if (error) {
      setRitualEnabled(prev);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    notifyRitualChanged();
    toast.success(next ? "Het ritueel staat aan." : "Het ritueel staat uit.");
  }

  async function handleTestNotification() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") {
      toast.error("Geef eerst toestemming voor meldingen.");
      return;
    }
    try {
      await fireRitualNotification();
      toast.success("Test-melding verstuurd.");
    } catch (err) {
      console.error("[ritual] test failed", err);
      toast.error(err instanceof Error ? err.message : "Test-melding lukte niet.");
    }
  }


  async function handleRitualTimeChange(value: string) {
    if (!user) return;
    // Snap to 30-min steps
    const [h, m] = value.split(":");
    const minutes = Math.round((Number(m) || 0) / 30) * 30;
    const normalized = `${(h || "00").padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const hour = minutes === 60 ? String((Number(h) + 1) % 24).padStart(2, "0") : (h || "00").padStart(2, "0");
    const snapped = `${hour}:${String(minutes % 60).padStart(2, "0")}`;
    setRitualTime(snapped);
    const { error } = await supabase
      .from("user_profiles")
      .update({ ritual_time: snapped } as never)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Dit lukte nu even niet.");
      return;
    }
    notifyRitualChanged();
  }


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

  async function handleVoiceChange(nextVoiceId: string) {
    if (!user || voiceSaving || nextVoiceId === voiceId) return;
    const previous = voiceId;
    setVoiceId(nextVoiceId);
    setVoiceSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ voice_id: nextVoiceId } as never)
      .eq("user_id", user.id);
    setVoiceSaving(false);
    if (error) {
      setVoiceId(previous);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    setVoiceIdCache(nextVoiceId);
    toast.success("Stem opgeslagen.");
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

        {voiceEnabled && (
          <div className="mt-6 space-y-3">
            <Label className="text-sm text-foreground">Welke stem?</Label>
            <div className="space-y-2">
              {VOICE_OPTIONS.map((v) => {
                const selected = voiceId === v.id;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-background"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleVoiceChange(v.id)}
                      disabled={voiceSaving}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm text-foreground">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.desc}</div>
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => speakText(SAMPLE_TEXT, { force: true, voiceId: v.id })}
                    >
                      Beluister
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6 rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
        <h2 className="text-base text-foreground">Dagelijks loslaten-moment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Een zacht signaal aan het eind van je dag.
        </p>

        <div className="mt-5 flex items-center justify-between gap-4">
          <Label htmlFor="ritual-toggle" className="text-sm text-foreground">
            Herinner mij
          </Label>
          <Switch
            id="ritual-toggle"
            checked={ritualEnabled}
            disabled={loading || ritualSaving}
            onCheckedChange={handleRitualToggle}
          />
        </div>

        {ritualEnabled && (
          <div className="mt-5 space-y-2">
            <Label htmlFor="ritual-time" className="text-sm text-foreground">
              Op welk moment?
            </Label>
            <Input
              id="ritual-time"
              type="time"
              step={1800}
              value={ritualTime}
              onChange={(e) => setRitualTime(e.target.value)}
              onBlur={(e) => handleRitualTimeChange(e.target.value)}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              In stappen van 30 minuten. Meldingen verschijnen alleen als de app open is.
            </p>
            {notifPermission === "granted" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                className="mt-2 rounded-full"
              >
                Test melding
              </Button>
            )}
          </div>
        )}

        {notifPermission === "denied" && (
          <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            Meldingen staan geblokkeerd in je browser.{" "}
            <button
              type="button"
              onClick={() => setShowDeniedHelp(true)}
              className="underline hover:text-foreground"
            >
              Hoe zet ik ze aan?
            </button>
          </div>
        )}


        {streak >= 2 && (
          <p className="mt-5 text-sm text-muted-foreground">
            Je hebt {streak} avonden achter elkaar losgelaten.
          </p>
        )}
      </Card>


      <Card className="mt-6 rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
        <h2 className="text-base text-foreground">Agenda's</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Koppel je Google Agenda zodat HoofdRust mee kan kijken.
        </p>
        <Button asChild variant="outline" className="mt-4 w-full rounded-full">
          <Link to="/agendas">Beheer agenda-koppeling</Link>
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

      <Dialog open={showDeniedHelp} onOpenChange={setShowDeniedHelp}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-left font-display text-xl tracking-[-0.02em]">
              Meldingen staan geblokkeerd
            </DialogTitle>
            <DialogDescription className="text-left">
              Je browser blokkeert meldingen voor HoofdRust. Zet ze als volgt aan:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-foreground/85">
            <p>
              <strong>Chrome / Edge / Android:</strong> tik op het slot-icoon links in de adresbalk →{" "}
              <em>Site-instellingen</em> → <em>Meldingen</em> → kies <em>Toestaan</em>.
            </p>
            <p>
              <strong>Safari (Mac):</strong> Safari → <em>Instellingen</em> → <em>Websites</em> →{" "}
              <em>Meldingen</em> → zet HoofdRust op <em>Sta toe</em>.
            </p>
            <p>
              <strong>Firefox:</strong> klik op het slot-icoon in de adresbalk → <em>Toestemmingen</em> →{" "}
              <em>Meldingen verzenden</em> → <em>Toestaan</em>.
            </p>
            <p className="rounded-2xl bg-muted/40 px-4 py-3 text-xs italic text-muted-foreground">
              Laad de pagina opnieuw na het wijzigen en probeer de toggle opnieuw.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowDeniedHelp(false)} className="w-full rounded-full">
              Begrepen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-left font-display text-xl tracking-[-0.02em]">
              Zet HoofdRust op je beginscherm
            </DialogTitle>
            <DialogDescription className="text-left">
              Meldingen werken op iPhone alleen als je HoofdRust toevoegt aan je beginscherm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-foreground/85">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Tik op het deel-icoon onderin Safari.</li>
              <li>Kies <em>'Zet op beginscherm'</em>.</li>
              <li>Open HoofdRust vanaf je beginscherm.</li>
              <li>Daarna kun je hier meldingen aanzetten.</li>
            </ol>
            <p className="rounded-2xl bg-muted/40 px-4 py-3 text-xs italic text-muted-foreground">
              Dit is een eenmalige stap. Daarna voelt de app als een echte app.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowIosHelp(false)} className="w-full rounded-full">
              Begrepen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>

  );
}
