import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { runBrainTest, type BrainTestResult } from "@/lib/brain-test.functions";

/**
 * Dev/admin-only Test Mode.
 * Zichtbaar alleen wanneer `import.meta.env.DEV === true`. In productie
 * gooit de route een redirect naar de homepage — eindgebruikers krijgen
 * deze pagina nooit te zien.
 */

const SCENARIOS: string[] = [
  "Heb je borrelhapjes suggesties voor zaterdag?",
  "Ik ben moe en heb nog zoveel te doen.",
  "Mijn dochter heeft morgen gym.",
  "Wat eten we vanavond?",
  "We gaan over twee weken op vakantie.",
  "Ik ben bang dat ik het cadeautje vergeet.",
  "Zaterdag komen vrienden borrelen.",
  "Mijn dochter is al een paar dagen verkouden.",
  "Ik heb morgen een drukke dag.",
  "Kun je me helpen mijn hoofd leeg te maken?",
];

export const Route = createFileRoute("/test-mode")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "HoofdRust — Test Mode (dev)" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Interne test-omgeving voor HoofdRust Brain." },
    ],
  }),
  component: TestModePage,
});

type Row = {
  scenario: string;
  loading: boolean;
  result: BrainTestResult | null;
};

function TestModePage() {
  const runTest = useServerFn(runBrainTest);
  const [rows, setRows] = useState<Row[]>(
    SCENARIOS.map((s) => ({ scenario: s, loading: false, result: null })),
  );
  const [custom, setCustom] = useState("");
  const [customRow, setCustomRow] = useState<Row | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  async function runOne(idx: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, loading: true } : r)),
    );
    try {
      const result = await runTest({ data: { text: SCENARIOS[idx] } });
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, loading: false, result } : r)),
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                loading: false,
                result: {
                  ok: false,
                  transcript: SCENARIOS[idx],
                  reasoning: null,
                  draftReply: "",
                  qualityImproved: null,
                  finalReply: "",
                  intent: "-",
                  actionRequired: false,
                  needsConfirmation: false,
                  suggestedActions: [],
                  confidence: 0,
                  ambiguous: false,
                  clarificationQuestion: null,
                  model: "error",
                  totalTokens: null,
                  error: err instanceof Error ? err.message : String(err),
                },
              }
            : r,
        ),
      );
    }
  }

  async function runAll() {
    setBatchRunning(true);
    for (let i = 0; i < SCENARIOS.length; i++) {
      // serieel om rate-limits te ontzien
      await runOne(i);
    }
    setBatchRunning(false);
  }

  async function runCustom() {
    const text = custom.trim();
    if (!text) return;
    setCustomRow({ scenario: text, loading: true, result: null });
    try {
      const result = await runTest({ data: { text } });
      setCustomRow({ scenario: text, loading: false, result });
    } catch (err) {
      setCustomRow({
        scenario: text,
        loading: false,
        result: {
          ok: false,
          transcript: text,
          reasoning: null,
          draftReply: "",
          qualityImproved: null,
          finalReply: "",
          intent: "-",
          actionRequired: false,
          needsConfirmation: false,
          suggestedActions: [],
          confidence: 0,
          ambiguous: false,
          clarificationQuestion: null,
          model: "error",
          totalTokens: null,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">DEV ONLY</Badge>
            <h1 className="text-2xl font-semibold">HoofdRust Test Mode</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Interne trace van de Brain (reasoning → concept-reply → quality → finale reply).
            Niet zichtbaar voor eindgebruikers.
          </p>
          <div className="flex gap-2">
            <Button onClick={runAll} disabled={batchRunning}>
              {batchRunning ? "Bezig..." : "Draai alle 10 scenario's"}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Terug</Link>
            </Button>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Eigen prompt
          </h2>
          <Textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Typ een testzin..."
            rows={2}
          />
          <Button onClick={runCustom} disabled={!custom.trim() || customRow?.loading}>
            {customRow?.loading ? "Bezig..." : "Test deze prompt"}
          </Button>
          {customRow && <ResultCard row={customRow} />}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            10 vaste scenario's
          </h2>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <ScenarioCard key={i} row={row} index={i} onRun={() => runOne(i)} />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ScenarioCard({
  row,
  index,
  onRun,
}: {
  row: Row;
  index: number;
  onRun: () => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Scenario #{index + 1}</p>
          <p className="text-sm font-medium">"{row.scenario}"</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRun} disabled={row.loading}>
          {row.loading ? "..." : row.result ? "Opnieuw" : "Test"}
        </Button>
      </div>
      {row.result && <ResultBody result={row.result} />}
    </Card>
  );
}

function ResultCard({ row }: { row: Row }) {
  if (!row.result) return null;
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-medium">"{row.scenario}"</p>
      <ResultBody result={row.result} />
    </Card>
  );
}

function ResultBody({ result }: { result: BrainTestResult }) {
  if (result.error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        Fout: {result.error}
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">intent: {result.intent}</Badge>
        <Badge variant="secondary">
          confidence: {(result.confidence * 100).toFixed(0)}%
        </Badge>
        {result.actionRequired && <Badge>actie voorgesteld</Badge>}
        {result.needsConfirmation && <Badge variant="outline">bevestiging nodig</Badge>}
        {result.ambiguous && <Badge variant="outline">ambigu</Badge>}
        {result.qualityImproved && (
          <Badge variant="outline">quality: verbeterd</Badge>
        )}
        <Badge variant="outline">{result.model}</Badge>
        {result.totalTokens != null && (
          <Badge variant="outline">{result.totalTokens} tokens</Badge>
        )}
      </div>

      <Section title="Interne reasoning (verborgen voor gebruiker)">
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
          {result.reasoning ?? "— geen reasoning —"}
        </pre>
      </Section>

      <Section title="Concept-reply (voor quality check)">
        <p className="text-sm">{result.draftReply || "—"}</p>
      </Section>

      {result.qualityImproved && (
        <Section title="Quality layer: verbeterde reply">
          <p className="text-sm">{result.qualityImproved}</p>
        </Section>
      )}

      <Section title="Finale reply (wat de gebruiker hoort)">
        <p className="text-sm font-medium">{result.finalReply}</p>
      </Section>

      {result.clarificationQuestion && (
        <Section title="Vervolgvraag">
          <p className="text-sm italic">{result.clarificationQuestion}</p>
        </Section>
      )}

      {result.suggestedActions.length > 0 && (
        <Section title={`Voorgestelde acties (${result.suggestedActions.length})`}>
          <ul className="space-y-1">
            {result.suggestedActions.map((a, i) => (
              <li key={i} className="rounded bg-muted p-2 text-xs">
                <span className="font-mono font-medium">{a.intent}</span>{" "}
                <span className="text-muted-foreground">{a.payloadJson}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}
