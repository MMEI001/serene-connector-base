import type { VoiceAction, VoiceIntent } from "./types";

/**
 * Fase B intent-classifier via Lovable AI Gateway (OpenAI-compatible).
 * Eén call → één intent + payload. Datum/tijd worden in NL geïnterpreteerd
 * t.o.v. een meegegeven "now" en `Europe/Amsterdam`-tijdzone.
 *
 * Bij gateway-fout valt 'm terug op release(text) met confidence=0.2 — de
 * pipeline behandelt dat als zachte fallback i.p.v. een harde error.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

type ClassifyMeta = {
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

export type ClassifyResult = {
  action: VoiceAction;
  meta: ClassifyMeta;
};

const INTENT_VALUES: VoiceIntent[] = [
  "release",
  "reminder",
  "note",
  "event",
  "query",
  "checkin",
];

const TOOL = {
  type: "function" as const,
  function: {
    name: "classify",
    description:
      "Classificeer wat de gebruiker tegen de spraak-orb zei en extraheer de payload.",
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", enum: INTENT_VALUES },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        ambiguous: { type: "boolean" },
        clarification_question: {
          type: "string",
          description:
            "Korte NL-vervolgvraag als de input dubbelzinnig is (datum, tijdstip). Anders leeg.",
        },
        payload: {
          type: "object",
          description:
            "Intent-specifieke velden. Zie systeem-prompt voor schema per intent.",
          properties: {
            text: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            iso_datetime: {
              type: "string",
              description: "ISO 8601 in Europe/Amsterdam (bv. 2026-06-24T09:00:00+02:00).",
            },
            date: { type: "string", description: "YYYY-MM-DD" },
            start_time: { type: "string", description: "HH:MM (24u)" },
            end_time: { type: "string", description: "HH:MM (24u)" },
            scope: {
              type: "string",
              enum: ["today", "tomorrow", "this_week", "next_week", "specific_date"],
            },
            action: { type: "string", enum: ["create", "delete", "move"] },
          },
        },
      },
      required: ["intent", "confidence", "payload"],
    },
  },
};

function systemPrompt(nowIso: string) {
  return `Je bent de intent-classifier van HoofdRust, een rustige Nederlandse spraak-app.
De gebruiker spreekt één korte zin in. Bepaal de intent en extraheer een payload.

INTENTS:
- release   → iets loslaten/luchten ("ik baal van...", "laat los", emotie spuien).
              payload: { text }
- reminder  → herinnering met tijdstip ("herinner me morgen om 9 aan tandarts").
              payload: { title, iso_datetime, description? }
- event     → afspraak in agenda. action="create" voor nieuw, "delete" voor verwijderen.
              payload: { action, title, date, start_time?, end_time?, description? }
- query     → vraag over agenda/reminders ("wat staat er morgen?", "wanneer is de meeting?").
              payload: { scope, date? }     // date bij scope="specific_date"
- note      → losse notitie ("noteer: ...", "schrijf op dat...").
              payload: { text }
- checkin   → korte stemmings-check zonder duidelijk doel.
              payload: { text }

Regels:
- "Nu" = ${nowIso}. Tijdzone Europe/Amsterdam. Reken datums/tijden hier vandaan.
- Geef ALTIJD een ISO-datetime mét tijdzone-offset voor reminders.
- Bij twijfel over datum/tijd: zet ambiguous=true en clarification_question (NL, kort).
- Bij geen duidelijke intent → release met de originele tekst.
- confidence 0..1 — wees eerlijk laag bij twijfel.
- Antwoord uitsluitend via de classify-tool, nooit als tekst.`;
}

export async function processVoiceInput(text: string): Promise<ClassifyResult> {
  const trimmed = text.trim();
  const fallback = (intent: VoiceIntent, payload: Record<string, unknown>, conf = 0.2): ClassifyResult => ({
    action: { intent, payload, confidence: conf },
    meta: { model: "fallback", prompt_tokens: null, completion_tokens: null, total_tokens: null },
  });

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[classify] LOVABLE_API_KEY ontbreekt — fallback naar release");
    return fallback("release", { text: trimmed });
  }

  const nowIso = new Date().toISOString();

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt(nowIso) },
          { role: "user", content: trimmed },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "classify" } },
        temperature: 0.1,
      }),
    });
  } catch (err) {
    console.error("[classify] gateway fetch error", err);
    return fallback("release", { text: trimmed });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[classify] gateway", res.status, body.slice(0, 300));
    return fallback("release", { text: trimmed });
  }

  type GatewayResp = {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const json = (await res.json().catch(() => null)) as GatewayResp | null;
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    console.warn("[classify] geen tool_call in response");
    return fallback("release", { text: trimmed });
  }

  let parsed: {
    intent?: string;
    confidence?: number;
    ambiguous?: boolean;
    clarification_question?: string;
    payload?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    return fallback("release", { text: trimmed });
  }

  const intent = INTENT_VALUES.includes(parsed.intent as VoiceIntent)
    ? (parsed.intent as VoiceIntent)
    : "release";
  const payload = parsed.payload ?? {};
  if (intent === "release" && !payload.text) payload.text = trimmed;

  return {
    action: {
      intent,
      payload,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
      ambiguous: !!parsed.ambiguous,
      clarification_question: parsed.clarification_question?.trim() || null,
    },
    meta: {
      model: MODEL,
      prompt_tokens: json?.usage?.prompt_tokens ?? null,
      completion_tokens: json?.usage?.completion_tokens ?? null,
      total_tokens: json?.usage?.total_tokens ?? null,
    },
  };
}
