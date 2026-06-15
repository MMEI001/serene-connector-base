import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  listIcsCalendars,
  addIcsCalendar,
  deleteIcsCalendar,
  syncIcsCalendar,
} from "@/lib/ics-calendar.functions";

type IcsCal = {
  id: string;
  name: string;
  url: string;
  color: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  event_count: number;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "nog niet gesynchroniseerd";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "zojuist";
  if (mins < 60) return `${mins} min geleden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} u geleden`;
  const days = Math.floor(hrs / 24);
  return `${days} d geleden`;
}

export function IcsCalendarsSection() {
  const listFn = useServerFn(listIcsCalendars);
  const addFn = useServerFn(addIcsCalendar);
  const delFn = useServerFn(deleteIcsCalendar);
  const syncFn = useServerFn(syncIcsCalendar);

  const [cals, setCals] = useState<IcsCal[] | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await listFn();
      setCals(data as IcsCal[]);
    } catch (e) {
      console.error("[ics] list failed", e);
      setCals([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      await addFn({ data: { name: name.trim(), url: url.trim() } });
      setName("");
      setUrl("");
      toast.success("Agenda gekoppeld");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Toevoegen lukte niet";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await delFn({ data: { id } });
      setCals((prev) => (prev ?? []).filter((c) => c.id !== id));
      toast.success("Agenda verwijderd");
    } catch {
      toast.error("Verwijderen lukte niet");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSync(id: string) {
    setBusyId(id);
    try {
      const r = await syncFn({ data: { id } });
      if ("ok" in r && r.ok) toast.success(`Gesynchroniseerd (${r.count} events)`);
      else if ("error" in r) toast.error(r.error);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync mislukte";
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mt-6 rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
      <h2 className="text-base text-foreground">Andere agenda's (ICS)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Plak een openbare iCloud-, Outlook- of Google-link (webcal:// of
        https://). HoofdRust ververst elk uur automatisch.
      </p>

      <form onSubmit={handleAdd} className="mt-5 space-y-3">
        <div>
          <Label htmlFor="ics-name" className="text-xs text-muted-foreground">
            Naam
          </Label>
          <Input
            id="ics-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="bv. Werk"
            maxLength={100}
            className="mt-1 rounded-2xl"
          />
        </div>
        <div>
          <Label htmlFor="ics-url" className="text-xs text-muted-foreground">
            ICS-URL
          </Label>
          <Input
            id="ics-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="webcal://… of https://…"
            maxLength={2000}
            className="mt-1 rounded-2xl"
          />
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="help" className="border-0">
              <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                Hoe vind ik mijn agenda-link?
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 text-xs text-muted-foreground">
                  <div>
                    <p className="mb-1 font-medium text-foreground">
                      Apple Agenda (iPhone/iPad)
                    </p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Open de Agenda-app</li>
                      <li>Tik onderaan op Agenda's</li>
                      <li>
                        Tik op het (i)-icoontje naast de agenda die je wilt
                        koppelen
                      </li>
                      <li>Schakel Openbare agenda in</li>
                      <li>Tik op Deel link en kies bijvoorbeeld 'Kopieer'</li>
                      <li>Plak de link hierboven</li>
                    </ol>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-foreground">
                      Apple Agenda (Mac)
                    </p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Open de Agenda-app</li>
                      <li>
                        Beweeg in de zijbalk met je muis over de agenda die je
                        wilt koppelen
                      </li>
                      <li>
                        Klik op het uitzend-icoontje (📡) dat verschijnt naast
                        de naam
                      </li>
                      <li>Vink Openbare agenda aan</li>
                      <li>
                        Klik op E-mail link of rechtsklik op de agenda → Kopieer
                        URL
                      </li>
                      <li>Plak de link hierboven</li>
                    </ol>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-foreground">
                      Google Agenda (web)
                    </p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Ga naar calendar.google.com</li>
                      <li>
                        Hover in de linker zijbalk over de agenda → klik op de
                        drie puntjes → Instellingen en delen
                      </li>
                      <li>
                        Scroll naar Toegangsrechten voor evenementen → vink
                        Openbaar beschikbaar maken aan
                      </li>
                      <li>Scroll verder naar Integratie van agenda</li>
                      <li>
                        Kopieer de Openbare URL naar deze agenda (eindigt op
                        /public/basic.ics)
                      </li>
                      <li>Plak de link hierboven</li>
                    </ol>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-foreground">
                      Outlook / Microsoft 365
                    </p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Ga naar outlook.live.com/calendar</li>
                      <li>
                        Klik rechtsboven op Instellingen (tandwiel) → Agenda →
                        Gedeelde agenda's
                      </li>
                      <li>
                        Onder Een agenda publiceren kies je de agenda en stel
                        Alle details kunnen zien in
                      </li>
                      <li>Kopieer de ICS-link</li>
                      <li>Plak de link hierboven</li>
                    </ol>
                  </div>
                  <p className="text-destructive">
                    Let op: een openbare link betekent dat iedereen met de URL
                    de agenda kan zien. Updates verschijnen niet direct, maar
                    binnen enkele uren.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <Button
          type="submit"
          disabled={submitting || !name.trim() || !url.trim()}
          className="w-full rounded-full"
        >
          {submitting ? "Bezig…" : "Toevoegen"}
        </Button>
      </form>

      <div className="mt-6">
        {cals === null ? (
          <Skeleton className="h-16 w-full rounded-2xl" />
        ) : cals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen ICS-agenda's gekoppeld.
          </p>
        ) : (
          <ul className="space-y-3">
            {cals.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-border/60 bg-background px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground">{c.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.event_count} events · {formatRelative(c.last_synced_at)}
                    </div>
                    {c.last_error && (
                      <div className="mt-1 text-xs text-destructive">
                        Fout: {c.last_error}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSync(c.id)}
                      disabled={busyId === c.id}
                      className="rounded-full"
                    >
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(c.id)}
                      disabled={busyId === c.id}
                      className="rounded-full text-destructive hover:text-destructive"
                    >
                      Verwijderen
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
