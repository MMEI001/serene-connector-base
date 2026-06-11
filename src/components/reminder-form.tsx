import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

export type ReminderFormValues = {
  id?: string;
  title: string;
  description: string | null;
  remind_at: string | null;
};

type Props = {
  mode: "create" | "edit";
  initial?: ReminderFormValues;
};

function splitRemindAt(iso: string | null) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function ReminderForm({ mode, initial }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const split = splitRemindAt(initial?.remind_at ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(split.date);
  const [time, setTime] = useState(split.time);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!title.trim()) {
      toast.error("Geef je reminder een titel");
      return;
    }
    if (time && !date) {
      toast.error("Kies ook een datum");
      return;
    }

    let remindAt: string | null = null;
    if (date) {
      const t = time || "09:00";
      const local = new Date(`${date}T${t}:00`);
      if (Number.isNaN(local.getTime())) {
        toast.error("Datum of tijd is ongeldig");
        return;
      }
      remindAt = local.toISOString();
    }

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        remind_at: remindAt,
      };

      if (mode === "create") {
        const { error } = await supabase.from("reminders").insert({
          ...payload,
          user_id: user.id,
          source: "manual",
          status: "active",
        });
        if (error) throw error;
        toast.success("Je reminder is opgeslagen.");
      } else if (initial?.id) {
        const { error } = await supabase
          .from("reminders")
          .update(payload)
          .eq("id", initial.id)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Je wijziging is opgeslagen.");
      }

      navigate({ to: "/reminders" });
    } catch (err) {
      console.error("[reminder save]", err);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="rounded-xl"
            placeholder="Waar wil je aan herinnerd worden?"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Omschrijving (optioneel)</Label>
          <Textarea
            id="description"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            className="rounded-2xl"
            placeholder="Iets extra's om te onthouden?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="date">Datum (optioneel)</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="time">Tijd (optioneel)</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="flex-1 rounded-full"
            onClick={() => navigate({ to: "/reminders" })}
          >
            Annuleren
          </Button>
          <Button
            type="submit"
            disabled={busy}
            size="lg"
            className="flex-1 rounded-full"
          >
            {busy ? "Opslaan…" : "Opslaan"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
