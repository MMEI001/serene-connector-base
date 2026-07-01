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

// (INTENT_VALUES verwijderd — mapping loopt nu via mapProductIntent hieronder.)


/**
 * Product-facing intent taxonomy. Wordt in de mapper omgezet naar de
 * interne VoiceIntent die de handlers/pipeline gebruiken.
 */
const PRODUCT_INTENTS = [
  "conversation",
  "advice",
  "brainstorm",
  "planning",
  "calendar",
  "reminder",
  "shopping",
  "todo",
  "clarification",
  "confirmation",
] as const;
type ProductIntent = (typeof PRODUCT_INTENTS)[number];

const SUGGESTED_ACTION_TYPES = ["event", "reminder", "note"] as const;

const TOOL = {
  type: "function" as const,
  function: {
    name: "respond",
    description:
      "Denk eerst na, beantwoord de gebruiker inhoudelijk in `reply`, en stel pas daarna eventueel acties voor. Maximaal 3 acties.",
    parameters: {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description:
            "Het natuurlijke antwoord dat HoofdRust uitspreekt. Beantwoord ALTIJD eerst de vraag inhoudelijk. Warm, menselijk Nederlands. Mag opsommingen bevatten als dat helpt. Nooit leeg.",
        },
        intent: {
          type: "string",
          enum: PRODUCT_INTENTS as unknown as string[],
          description: "Het type intentie dat het beste past bij de gebruikersvraag.",
        },
        action_required: {
          type: "boolean",
          description: "True als er een concrete vervolgactie hoort bij dit antwoord (agenda, reminder, notitie, boodschappenlijst).",
        },
        needs_confirmation: {
          type: "boolean",
          description:
            "True als de gebruiker eerst moet bevestigen voordat de actie wordt uitgevoerd. Bij twijfel: true.",
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        ambiguous: { type: "boolean" },
        clarification_question: {
          type: "string",
          description: "Alleen bij écht cruciale ontbrekende info.",
        },
        suggested_actions: {
          type: "array",
          maxItems: MAX_ACTIONS,
          description: "Concrete acties bij dit antwoord. Leeg wanneer action_required=false.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: SUGGESTED_ACTION_TYPES as unknown as string[] },
              title: { type: "string" },
              text: { type: "string" },
              description: { type: "string" },
              date: { type: "string", description: "YYYY-MM-DD of natuurlijke taal (bv. 'vrijdag')." },
              iso_datetime: {
                type: "string",
                description: "Volledig ISO 8601 met Europe/Amsterdam offset, bv. 2026-06-27T09:00:00+02:00.",
              },
              start_time: { type: "string", description: "HH:MM (voor event)." },
              end_time: { type: "string" },
            },
            required: ["type"],
          },
        },
        experience: { type: "string", enum: ["gift_event"] },
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
      required: ["reply", "intent", "action_required", "needs_confirmation"],
    },
  },
};

function systemPrompt(nowIso: string, persona?: UserPersona, contextSummary?: string | null) {
  const personaBlock = persona?.promptFragment ? `\n\n${persona.promptFragment}` : "";
  const contextBlock =
    contextSummary && contextSummary.trim()
      ? `\n\nHUIDIGE CONTEXT (gebruik dit in je antwoord waar relevant):\n${contextSummary.trim()}`
      : "";

  return `Je bent HoofdRust — een warme, slimme Nederlandse persoonlijke assistent die met de gebruiker praat via een spraak-orb. Je klinkt als een meedenkende vriend(in): natuurlijk, empathisch, kort waar het kan, uitgebreider waar het helpt.${personaBlock}${contextBlock}

KERNREGEL
Beantwoord ALTIJD eerst inhoudelijk in \`reply\`. Je mag NOOIT stilvallen. Als er geen actie nodig is: geef gewoon een goed antwoord en zet action_required=false. Pas NA het antwoord mag je (optioneel) een concrete vervolgactie aanbieden via suggested_actions.

STRUCTURED OUTPUT
Elk antwoord bevat:
- reply: het uitgesproken antwoord (verplicht, nooit leeg).
- intent: één van ${PRODUCT_INTENTS.join(", ")}.
- action_required: true bij concrete vervolgactie.
- needs_confirmation: true als de gebruiker eerst moet bevestigen.
- suggested_actions: array met acties (type + velden). Leeg bij action_required=false.

VOORBEELDEN
- "Heb je borrelhapjes voor zaterdag?" → intent="advice_question", reply=lijst hapjes + aanbod, action_required=true, needs_confirmation=true, suggested_actions=[{type:"note", title:"Boodschappenlijst", text:"..."}].
- "Ik ben bang dat ik het cadeautje vergeet." → intent="reminder_action", reply="Snap ik. Zal ik donderdag een herinnering zetten?", action_required=true, needs_confirmation=true, suggested_actions=[{type:"reminder", title:"Cadeautje kopen", date:"donderdag"}].
- "Wat eten we vanavond?" → intent="planning_help", reply="Wil je iets makkelijks, gezonds of gezelligs?", action_required=false.
- "Zet morgen 9 uur tandarts" → intent="calendar_action", reply="Ik heb tandarts morgen om 9 uur klaargezet — wil je bevestigen?", action_required=true, needs_confirmation=true, suggested_actions=[{type:"event", title:"Tandarts", date:"YYYY-MM-DD", start_time:"09:00"}].

INTENT-KEUZE
- conversational_answer / advice_question / planning_help → geen actie of vrijblijvend aanbod.
- calendar_action → duidelijke agenda-inschrijving (type:"event").
- reminder_action → gebruiker wil herinnerd worden (type:"reminder").
- task_action / shopping_list_action → losse notitie of boodschappenlijst (type:"note"). Boodschappenlijst: title="Boodschappenlijst", text="item1\\nitem2".
- clarification_needed → ambiguous=true + clarification_question (zeldzaam).

SUGGESTED_ACTIONS REGELS
- Alleen bij actief aanbod. Anders leeg.
- iso_datetime altijd volledig ISO 8601 met offset ("2026-06-27T09:00:00+02:00").
- Reminder zonder tijd → 09:00 Europe/Amsterdam op een logische dag.
- Titels kort en imperatief.
- Vul zelf slimme defaults — vraag niets terug.

EXPERIENCE
- Sociale gebeurtenis voor iemand anders (kinderfeestje, verjaardag, bruiloft) → experience="gift_event" + experience_data. Laat suggested_actions leeg, geef warme reply.

ALGEMEEN
- "Nu" = ${nowIso}. Tijdzone Europe/Amsterdam.
- confidence 0..1, eerlijk laag bij twijfel.
- Antwoord uitsluitend via het \`respond\`-tool. Bij twijfel: intent="conversational_answer" met een goed antwoord — NOOIT stilvallen.`;
}

/** Map product-intent + suggested_action.type → interne VoiceIntent. */
function mapProductIntent(intent: ProductIntent, actionType?: string): VoiceIntent {
  if (actionType === "event") return "event";
  if (actionType === "reminder") return "reminder";
  if (actionType === "note") return "note";
  switch (intent) {
    case "calendar":
      return "event";
    case "reminder":
      return "reminder";
    case "todo":
    case "shopping":
      return "note";
    default:
      return "assistant_chat";
  }
}


export async function processVoiceInput(
  text: string,
  persona?: UserPersona,
  opts: BrainOptions = {},
): Promise<ClassifyResult> {
  const trimmed = text.trim();
  const chatFallback = (reply: string): ClassifyResult => ({
    actions: [{ intent: "assistant_chat", payload: { reply }, confidence: 0.2 }],
    meta: { model: "fallback", prompt_tokens: null, completion_tokens: null, total_tokens: null },
  });

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[brain] LOVABLE_API_KEY ontbreekt — fallback naar release");
    return chatFallback("Ik kan je nu even niet goed helpen — probeer het zo nog eens.");
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
    return chatFallback("Er ging even iets mis met mijn verbinding. Probeer het zo opnieuw.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[brain] gateway", res.status, body.slice(0, 300));
    return chatFallback("Ik kreeg geen goed antwoord terug. Wil je het nog eens proberen?");
  }

  type GatewayResp = {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const json = (await res.json().catch(() => null)) as GatewayResp | null;
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    console.warn("[brain] geen tool_call in response");
    return chatFallback("Ik hoorde je, maar wist even niet wat te doen. Kun je het anders zeggen?");
  }

  type SuggestedActionRaw = {
    type?: string;
    title?: string;
    text?: string;
    description?: string;
    date?: string;
    iso_datetime?: string;
    start_time?: string;
    end_time?: string;
    [k: string]: unknown;
  };
  let parsed: {
    reply?: string;
    intent?: string;
    action_required?: boolean;
    needs_confirmation?: boolean;
    confidence?: number;
    ambiguous?: boolean;
    clarification_question?: string;
    suggested_actions?: SuggestedActionRaw[];
    experience?: string;
    experience_data?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    return chatFallback("Ik hoorde je, maar mijn antwoord kwam raar terug. Probeer het nog eens.");
  }

  const reply = (parsed.reply ?? "").trim();
  if (!reply) {
    return chatFallback("Ik heb je gehoord — vertel eens iets meer, dan denk ik met je mee.");
  }

  const productIntent = (PRODUCT_INTENTS as readonly string[]).includes(parsed.intent ?? "")
    ? (parsed.intent as ProductIntent)
    : "conversation";
  const rawSuggested = Array.isArray(parsed.suggested_actions)
    ? parsed.suggested_actions.slice(0, MAX_ACTIONS)
    : [];
  const actionRequired = !!parsed.action_required && rawSuggested.length > 0;
  const needsConfirmation = !!parsed.needs_confirmation;
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;

  // Bouw suggested_actions in het intern verwachte {intent, payload} formaat.
  const suggestedActions = rawSuggested
    .filter((s) => s.type && SUGGESTED_ACTION_TYPES.includes(s.type as (typeof SUGGESTED_ACTION_TYPES)[number]))
    .map((s) => {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s)) {
        if (k === "type") continue;
        if (v !== undefined && v !== null && v !== "") payload[k] = v;
      }
      return { intent: s.type as VoiceIntent, payload };
    });

  const actions: VoiceAction[] = [];

  // Directe uitvoering zonder bevestiging → emit interne intent direct.
  if (actionRequired && !needsConfirmation && suggestedActions.length > 0) {
    for (const sa of suggestedActions) {
      const intent = mapProductIntent(productIntent, sa.intent);
      actions.push({
        intent,
        payload: { ...sa.payload, reply },
        confidence,
        ambiguous: false,
        clarification_question: null,
      });
    }
  } else {
    // Standaard: assistant_chat met reply + optionele suggested_actions
    // (deze vormen de bevestigings-kaart in de UI).
    const chatPayload: Record<string, unknown> = { reply };
    if (actionRequired && suggestedActions.length > 0) {
      chatPayload.suggested_actions = suggestedActions;
    }
    if (parsed.experience) chatPayload.experience = parsed.experience;
    if (parsed.experience_data) chatPayload.experience_data = parsed.experience_data;
    actions.push({
      intent: "assistant_chat",
      payload: chatPayload,
      confidence,
      ambiguous: !!parsed.ambiguous,
      clarification_question: parsed.clarification_question?.trim() || null,
    });
  }


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
