import type { VoiceAction, VoiceIntent } from "./types";
import type { UserPersona } from "./persona";

/**
 * Fase B + multi-action classifier via Lovable AI Gateway.
 * Eén call → 1..3 acties. De model splitst samengestelde zinnen
 * (bv. "afspraak woensdag + reminder 2 dagen ervoor") in losse acties.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const MAX_ACTIONS = 3;

type ClassifyMeta = {
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

export type ClassifyResult = {
  actions: VoiceAction[];
  meta: ClassifyMeta;
};

const INTENT_VALUES: VoiceIntent[] = [
  "release",
  "reminder",
  "note",
  "event",
  "query",
  "checkin",
  "assistant_chat",
];



const TOOL = {
  type: "function" as const,
  function: {
    name: "classify",
    description:
      "Classificeer wat de gebruiker tegen de spraak-orb zei. Splits samengestelde zinnen in losse acties (max 3).",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          maxItems: MAX_ACTIONS,
          items: {
            type: "object",
            properties: {
              intent: { type: "string", enum: INTENT_VALUES },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              ambiguous: { type: "boolean" },
              clarification_question: {
                type: "string",
                description: "Korte NL-vervolgvraag bij dubbelzinnige datum/tijd.",
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
                    description: "ISO 8601 in Europe/Amsterdam.",
                  },
                  date: { type: "string", description: "YYYY-MM-DD" },
                  start_time: { type: "string", description: "HH:MM (24u)" },
                  end_time: { type: "string", description: "HH:MM (24u)" },
                  scope: {
                    type: "string",
                    enum: [
                      "today",
                      "tomorrow",
                      "this_week",
                      "next_week",
                      "specific_date",
                    ],
                  },
                  action: {
                    type: "string",
                    enum: ["create", "delete", "move"],
                  },
                  /** Verwijzing naar een eerdere actie in dezelfde bundle (index 0..n-1). */
                  related_to_index: {
                    type: "integer",
                    minimum: 0,
                    description:
                      "Index van een eerdere actie in deze bundle waar deze reminder bij hoort.",
                  },
                  /** Alleen voor intent=assistant_chat: korte adviserende reactie. */
                  reply: {
                    type: "string",
                    description:
                      "assistant_chat: korte, rustige Nederlandse reactie (max 2 zinnen).",
                  },
                  /** Alleen voor intent=assistant_chat: optionele vervolgacties. */
                  suggested_actions: {
                    type: "array",
                    maxItems: MAX_ACTIONS,
                    description:
                      "assistant_chat: optionele vervolgacties (event/reminder/note) die de gebruiker eerst moet bevestigen. Nooit direct uitvoeren.",
                    items: {
                      type: "object",
                      properties: {
                        intent: {
                          type: "string",
                          enum: ["event", "reminder", "note"],
                        },
                        payload: { type: "object" },
                      },
                      required: ["intent", "payload"],
                    },
                  },
                },
              },
            },
            required: ["intent", "confidence", "payload"],
          },
        },
      },
      required: ["actions"],
    },
  },
};

function systemPrompt(nowIso: string, persona?: UserPersona) {
  const personaBlock = persona?.promptFragment ? `\n\n${persona.promptFragment}` : "";
  return `Je bent de intent-classifier van HoofdRust, een rustige Nederlandse spraak-app.${personaBlock}
De gebruiker spreekt één korte zin in. Splits 'm in 1..${MAX_ACTIONS} acties — meestal één, maar bij samengestelde commando's één per actie.

INTENTS:
- release        → iets loslaten/luchten. payload: { text }
- reminder       → herinnering met tijdstip. payload: { title, iso_datetime, description?, related_to_index? }
- event          → afspraak. payload: { action="create", title, date, start_time?, end_time?, description? }
- query          → vraag over agenda/reminders. payload: { scope, date? }
- note           → losse notitie. payload: { text }
- checkin        → stemmings-check. payload: { text }
- assistant_chat → de gebruiker vraagt om advies, uitleg, een plan, of denkt hardop. payload: { reply, suggested_actions? }

ASSISTANT_CHAT REGELS:
- Kies dit als de gebruiker NIET om een directe actie vraagt, maar om mee te denken, advies, suggesties, of een vraag stelt die niet door query gedekt wordt.
  Voorbeelden: "Wat zou jij doen?", "Help me prioriteren", "Hoe pak ik dit aan?", "Geef me een tip", "Wat staat er morgen écht op het spel?".
- reply: kort, rustig, adviserend Nederlands. Max 2 zinnen. Geen lijstjes, geen markdown.
- suggested_actions: ALLEEN als de gebruiker er concreet iets aan kan hebben (max ${MAX_ACTIONS}). Voorbeeld: "Help me morgen rustig te beginnen" → suggested_actions=[{ intent:"reminder", payload:{ title:"Adempauze", iso_datetime:"…T08:30+01:00" } }].
- suggested_actions worden NIET direct uitgevoerd — de gebruiker bevestigt eerst. Gebruik exact dezelfde payload-velden als bij gewone reminder/event/note.
- Bij twijfel tussen query en assistant_chat: kies query als er een agenda/reminder antwoord is, anders assistant_chat.

MULTI-ACTION REGELS (voor gewone event+reminder, niet voor assistant_chat):
- "Zet een afspraak X EN herinner me Y" → 2 acties: [event, reminder].
- Bij "X dagen/uur van tevoren": bereken iso_datetime = event-datum − X dagen/uur. Zonder kloktijd → default 09:00 Europe/Amsterdam.
- Zet related_to_index op de reminder naar de index van het event in de actions-array (meestal 0).
- Voor de reminder-title: kort en imperatief ("Cadeau kopen", "Tandartsbezoek voorbereiden") — niet de event-naam herhalen.

ALGEMENE REGELS:
- "Nu" = ${nowIso}. Tijdzone Europe/Amsterdam.
- ISO-datetime altijd mét tijdzone-offset.
- Bij twijfel over datum/tijd: ambiguous=true + clarification_question (kort, NL).
- Geen duidelijke intent → één action: release met originele tekst.
- confidence 0..1 — eerlijk laag bij twijfel.
- Antwoord uitsluitend via de classify-tool.`;
}

export async function processVoiceInput(text: string, persona?: UserPersona): Promise<ClassifyResult> {
  const trimmed = text.trim();
  const fallback = (intent: VoiceIntent, payload: Record<string, unknown>, conf = 0.2): ClassifyResult => ({
    actions: [{ intent, payload, confidence: conf }],
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
          { role: "system", content: systemPrompt(nowIso, persona) },
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
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const json = (await res.json().catch(() => null)) as GatewayResp | null;
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    console.warn("[classify] geen tool_call in response");
    return fallback("release", { text: trimmed });
  }

  let parsed: {
    actions?: Array<{
      intent?: string;
      confidence?: number;
      ambiguous?: boolean;
      clarification_question?: string;
      payload?: Record<string, unknown>;
    }>;
  };
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    return fallback("release", { text: trimmed });
  }

  const rawActions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, MAX_ACTIONS) : [];
  if (rawActions.length === 0) {
    return fallback("release", { text: trimmed });
  }

  const actions: VoiceAction[] = rawActions.map((a) => {
    const intent = INTENT_VALUES.includes(a.intent as VoiceIntent)
      ? (a.intent as VoiceIntent)
      : "release";
    const payload = a.payload ?? {};
    if (intent === "release" && !payload.text) payload.text = trimmed;
    return {
      intent,
      payload,
      confidence: typeof a.confidence === "number" ? a.confidence : 0.6,
      ambiguous: !!a.ambiguous,
      clarification_question: a.clarification_question?.trim() || null,
    };
  });

  return {
    actions,
    meta: {
      model: MODEL,
      prompt_tokens: json?.usage?.prompt_tokens ?? null,
      completion_tokens: json?.usage?.completion_tokens ?? null,
      total_tokens: json?.usage?.total_tokens ?? null,
    },
  };
}
