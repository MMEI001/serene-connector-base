import type { VoiceAction, VoiceIntent } from "./types";
import type { UserPersona } from "./persona";

/**
 * Brain / Orchestrator laag (upgraded).
 *
 * Elke turn gaat door één sterk taalmodel dat de vraag EERST begrijpt en
 * inhoudelijk beantwoordt, en pas daarna een eventuele vervolgactie
 * voorstelt. Zes intent-types (conform product-visie):
 *
 *   1. conversational_answer  → assistant_chat (rijk antwoord, geen actie)
 *   2. calendar_action        → event
 *   3. reminder_action        → reminder
 *   4. task_action            → note (to-do / boodschap)
 *   5. confirmation_needed    → assistant_chat + suggested_actions
 *   6. clarification_needed   → ambiguous=true + clarification_question
 *
 * Contract naar de rest van de app blijft ongewijzigd (ClassifyResult).
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
/** Sterker reasoning-model dan de klassieke flash-classifier. */
const MODEL = "google/gemini-3.1-pro-preview";
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

export type BrainHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

export type BrainOptions = {
  /** Compacte context-samenvatting (agenda, reminders, memories). */
  contextSummary?: string | null;
  /** Recente conversatie-turns (max ~6) voor natuurlijk vervolg. */
  history?: BrainHistoryEntry[];
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
    name: "respond",
    description:
      "Beantwoord de gebruiker en/of stel acties voor. Splits samengestelde commando's in losse acties (max 3).",
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
                description: "Korte NL-vervolgvraag bij ontbrekende cruciale info.",
              },
              payload: {
                type: "object",
                description: "Intent-specifieke velden.",
                properties: {
                  text: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  iso_datetime: { type: "string" },
                  date: { type: "string" },
                  start_time: { type: "string" },
                  end_time: { type: "string" },
                  scope: {
                    type: "string",
                    enum: ["today", "tomorrow", "this_week", "next_week", "specific_date"],
                  },
                  action: { type: "string", enum: ["create", "delete", "move"] },
                  related_to_index: { type: "integer", minimum: 0 },
                  reply: {
                    type: "string",
                    description:
                      "assistant_chat: het inhoudelijke antwoord op de vraag van de gebruiker. Natuurlijk Nederlands. Mag meerdere zinnen en opsommingen bevatten wanneer dat helpt. Beantwoord de vraag EERST — bied pas daarna hulp aan.",
                  },
                  suggested_actions: {
                    type: "array",
                    maxItems: MAX_ACTIONS,
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
                  experience: {
                    type: "string",
                    enum: ["gift_event"],
                  },
                  experience_data: {
                    type: "object",
                    properties: {
                      who: { type: "string" },
                      event_type: { type: "string" },
                      iso_datetime: { type: "string" },
                      age: { type: "number" },
                      interests: { type: "array", items: { type: "string" } },
                      budget: { type: "number" },
                      budget_currency: { type: "string" },
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

function systemPrompt(nowIso: string, persona?: UserPersona, contextSummary?: string | null) {
  const personaBlock = persona?.promptFragment ? `\n\n${persona.promptFragment}` : "";
  const contextBlock =
    contextSummary && contextSummary.trim()
      ? `\n\nHUIDIGE CONTEXT (gebruik dit in je antwoord waar relevant):\n${contextSummary.trim()}`
      : "";

  return `Je bent HoofdRust — een rustige, slimme Nederlandse persoonlijke assistent die met de gebruiker praat via een spraak-orb. Je klinkt als een warme, meedenkende vriend(in): natuurlijk, kort waar het kan, uitgebreider waar het helpt.${personaBlock}${contextBlock}

TAAK
Je krijgt één zin van de gebruiker (soms met eerdere turns als context). Beslis wat de zin is en antwoord via het \`respond\`-tool. Je mag NOOIT stilvallen — er is altijd een antwoord.

ZES INTENT-TYPES
1. conversational_answer → intent="assistant_chat". Gebruik dit voor gewone vragen, advies, ideeën, uitleg, gezellig meedenken, of hardop nadenken. Ook als de vraag een datum of onderwerp bevat maar de gebruiker niet expliciet om een agenda-inschrijving vraagt ("Heb je borrelhapjes-suggesties voor zaterdag?" → gewoon antwoorden).
2. calendar_action → intent="event". Alleen als de gebruiker duidelijk een afspraak wil zetten/wijzigen/verplaatsen ("Zet morgen 9 uur tandarts").
3. reminder_action → intent="reminder". Alleen als de gebruiker expliciet herinnerd wil worden ("Herinner me morgen om…").
4. task_action → intent="note". Losse notities, to-do's, of items voor een boodschappenlijstje ("Zet melk op het lijstje").
5. confirmation_needed → intent="assistant_chat" MET \`suggested_actions\`. Gebruik dit wanneer je op basis van de vraag een concrete vervolgactie aanbiedt die de gebruiker eerst moet bevestigen ("…zal ik een boodschappenlijstje voor je klaarzetten?").
6. clarification_needed → intent="assistant_chat" met \`ambiguous=true\` en \`clarification_question\`. Alleen bij écht cruciale ontbrekende info (bv. welke van twee bekende afspraken). NIET bij gewone adviesvragen — die beantwoord je gewoon met slimme defaults.

GEDRAG (heel belangrijk)
- Beantwoord ALTIJD eerst de vraag inhoudelijk in \`reply\`. Suggesties, ideeën, korte lijstjes, cijfermatige adviezen — allemaal welkom. Geen markdown-headers, wel nette prozalijstjes ("mini caprese-prikkers, bladerdeeghapjes met kaas, gevulde dadels…").
- Forceer niets richting agenda/reminder. Alleen als er een duidelijke actie-intentie is (of als een concreet aanbod echt logisch is), voeg je \`suggested_actions\` toe.
- Als je een vervolgactie aanbiedt, zeg dat expliciet in \`reply\` ("Zal ik daar meteen een boodschappenlijstje van maken?") — de gebruiker bevestigt via de UI.
- Gebruik de HUIDIGE CONTEXT (agenda, reminders, memories) én de eerdere conversatie in je antwoord. Verwijs kort ("Vrijdag zit je al vol tot 15:00, dus…") als dat helpt.
- Klink menselijk en warm, niet robotachtig. Vermijd bullet-tekens en emoji.
- Bij pure "ik wil dit even loslaten"-momenten (geen vraag, geen actie): intent="release", payload={ text }.

VELDEN PER INTENT
- release   → { text }
- reminder  → { title (kort, imperatief), iso_datetime (ISO 8601 met Europe/Amsterdam offset), description?, related_to_index? }
- event     → { action:"create", title, date (YYYY-MM-DD), start_time (HH:MM), end_time?, description? }
- note      → { text, title? }
- query     → { scope, date? }
- checkin   → { text }
- assistant_chat → { reply, suggested_actions? }

SUGGESTED_ACTIONS REGELS
- Alleen toevoegen als je een concreet, nuttig aanbod doet. Anders leeg laten.
- Vul zelf slimme defaults in — vraag NIETS terug via clarification.
- iso_datetime altijd volledig ISO 8601 met offset ("2026-06-27T09:00:00+02:00"), nooit natuurlijke taal.
- Bij ontbrekende tijd voor een reminder → 09:00 Europe/Amsterdam op een logische werkdag (bv. vrijdag vóór een zaterdag-event).
- Titels kort en imperatief ("Bloemen kopen", "Boodschappen doen").

EXPERIENCE PATRONEN (alleen bij assistant_chat)
- Sociale gebeurtenis voor iemand anders (kinderfeestje, verjaardag, bruiloft, doopfeest) → payload.experience="gift_event" + payload.experience_data (who?, event_type?, iso_datetime?, age?, interests?, budget?). LAAT dan suggested_actions weg — het framework bouwt zelf het cadeau-voorstel. Geef wel een warme reply.

MULTI-ACTION
- "Zet afspraak X en herinner me Y" → 2 acties [event, reminder]. Reminder krijgt related_to_index naar de event-index.
- "X dagen/uur van tevoren" → bereken iso_datetime = event-tijd − X. Default kloktijd 09:00.

ALGEMEEN
- "Nu" = ${nowIso}. Tijdzone Europe/Amsterdam.
- confidence 0..1, eerlijk laag bij twijfel.
- Antwoord uitsluitend via het \`respond\`-tool.`;
}

export async function processVoiceInput(
  text: string,
  persona?: UserPersona,
  opts: BrainOptions = {},
): Promise<ClassifyResult> {
  const trimmed = text.trim();
  const fallback = (intent: VoiceIntent, payload: Record<string, unknown>, conf = 0.2): ClassifyResult => ({
    actions: [{ intent, payload, confidence: conf }],
    meta: { model: "fallback", prompt_tokens: null, completion_tokens: null, total_tokens: null },
  });

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[brain] LOVABLE_API_KEY ontbreekt — fallback naar release");
    return fallback("release", { text: trimmed });
  }

  const nowIso = new Date().toISOString();

  // Bouw messages: system + geschiedenis + huidige user turn.
  const history = Array.isArray(opts.history) ? opts.history.slice(-6) : [];
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt(nowIso, persona, opts.contextSummary) },
  ];
  for (const h of history) {
    if (!h?.content) continue;
    if (h.role === "user" || h.role === "assistant") {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: trimmed });

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
        messages,
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "respond" } },
        temperature: 0.4,
      }),
    });
  } catch (err) {
    console.error("[brain] gateway fetch error", err);
    return fallback("release", { text: trimmed });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[brain] gateway", res.status, body.slice(0, 300));
    return fallback("release", { text: trimmed });
  }

  type GatewayResp = {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const json = (await res.json().catch(() => null)) as GatewayResp | null;
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    console.warn("[brain] geen tool_call in response");
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
