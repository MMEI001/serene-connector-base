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

export type AppointmentFormValues = {
  id?: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
};

type Props = {
  mode: "create" | "edit";
  initial?: AppointmentFormValues;
};

export function AppointmentForm({ mode, initial }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [startTime, setStartTime] = useState(
    initial?.start_time ? initial.start_time.slice(0, 5) : "",
  );
  const [endTime, setEndTime] = useState(
    initial?.end_time ? initial.end_time.slice(0, 5) : "",
  );
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!title.trim()) {
      toast.error("Geef je afspraak een titel");
      return;
    }
    if (!date) {
      toast.error("Kies een datum");
      return;
    }
    if (endTime && !startTime) {
      toast.error("Vul ook een starttijd in");
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      toast.error("De eindtijd moet na de starttijd liggen");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
      };

      if (mode === "create") {
        const { error } = await supabase.from("appointments").insert({
          ...payload,
          user_id: user.id,
          source: "manual",
          status: "scheduled",
        });
        if (error) throw error;
        toast.success("Je afspraak is opgeslagen.");
      } else if (initial?.id) {
        const { error } = await supabase
          .from("appointments")
          .update(payload)
          .eq("id", initial.id)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Je wijziging is opgeslagen.");
      }

      navigate({ to: "/agenda" });
    } catch (err) {
      console.error("[appointment save]", err);
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
            placeholder="Waar gaat het over?"
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
            placeholder="Extra notities of details"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Datum</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="start_time">Starttijd (optioneel)</Label>
            <Input
              id="start_time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_time">Eindtijd (optioneel)</Label>
            <Input
              id="end_time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
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
            onClick={() => navigate({ to: "/agenda" })}
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
