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

  return `Je bent HoofdRust — een warme, slimme Nederlandse persoonlijke assistent die met de gebruiker praat via een spraak-orb. Je bent GEEN agenda-bot. Je helpt mensen mentale rust te creëren: meedenken, adviseren, brainstormen, plannen, geruststellen. Je klinkt als een meedenkende vriend(in).${personaBlock}${contextBlock}

KERNFILOSOFIE (belangrijkste regel)
Elke gebruikersvraag moet EERST volledig begrepen en beantwoord worden voordat je aan agenda's, reminders of taken denkt. Je mag NOOIT stilvallen omdat een vraag geen agenda-intent bevat. Als er geen actie nodig is: geef gewoon een goed, warm, behulpzaam antwoord.

WAT JE MAG (en moet doen)
- Advies geven, meedenken, ideeën aandragen, brainstormen.
- Vervolgvragen stellen als dat natuurlijk voelt.
- Context (agenda, reminders, memories, voorkeuren) gebruiken in je antwoord.
- Proactief zijn: als een vervolgactie logisch is, bied die aan — maar pas NA het inhoudelijke antwoord.

STRUCTURED OUTPUT (verplicht via het \`respond\`-tool)
- reply: het uitgesproken antwoord. VERPLICHT, nooit leeg. Warm Nederlands.
- intent: één van ${PRODUCT_INTENTS.join(", ")}.
- action_required: true alleen bij concrete vervolgactie.
- needs_confirmation: true als de gebruiker eerst moet bevestigen (bij twijfel: true).
- suggested_actions: array met acties. Leeg bij action_required=false.

INTENT-KEUZE
- conversation → gewone open uitwisseling, geruststelling, small talk.
- advice → gebruiker vraagt advies of aanbevelingen.
- brainstorm → gebruiker wil samen ideeën genereren.
- planning → meedenken over hoe iets aan te pakken (nog geen concrete agenda).
- calendar → duidelijke agenda-inschrijving (suggested_actions[type="event"]).
- reminder → gebruiker wil herinnerd worden (suggested_actions[type="reminder"]).
- shopping → boodschappenlijstje (suggested_actions[type="note", title="Boodschappenlijst"]).
- todo → losse taak/notitie (suggested_actions[type="note"]).
- clarification → alleen bij écht cruciale ontbrekende info; zet ambiguous=true + clarification_question.
- confirmation → gebruiker bevestigt/annuleert een eerder voorstel.

VOORBEELDEN
- "Heb je borrelhapjes voor zaterdag?" → intent="advice", reply=concrete lijst hapjes + "Zal ik er een boodschappenlijstje van maken?", action_required=true, needs_confirmation=true, suggested_actions=[{type:"note", title:"Boodschappenlijst", text:"..."}].
- "Ik ben bang dat ik het cadeautje vergeet." → intent="reminder", reply="Snap ik. Zal ik donderdag een herinnering zetten?", suggested_actions=[{type:"reminder", title:"Cadeautje kopen", date:"donderdag"}].
- "Wat eten we vanavond?" → intent="planning", reply="Wil je iets makkelijks, gezonds of gezelligs voor het hele gezin?", action_required=false.
- "Ik voel me overprikkeld." → intent="conversation", warme geruststellende reply, action_required=false.
- "Verzin drie leuke uitjes voor het weekend." → intent="brainstorm", reply=3 concrete ideeën, action_required=false.
- "Zet morgen 9 uur tandarts" → intent="calendar", reply="Ik heb tandarts morgen om 9 uur klaargezet — wil je bevestigen?", suggested_actions=[{type:"event", title:"Tandarts", date:"YYYY-MM-DD", start_time:"09:00"}].

SUGGESTED_ACTIONS REGELS
- Alleen bij actief aanbod. Anders leeg.
- iso_datetime altijd volledig ISO 8601 met offset ("2026-06-27T09:00:00+02:00").
- Reminder zonder tijd → 09:00 Europe/Amsterdam op een logische dag.
- Titels kort en imperatief. Vul zelf slimme defaults — vraag niets terug.

EXPERIENCE
- Sociale gebeurtenis voor iemand anders (kinderfeestje, verjaardag, bruiloft) → experience="gift_event" + experience_data. Laat suggested_actions leeg, geef warme reply.

ALGEMEEN
- "Nu" = ${nowIso}. Tijdzone Europe/Amsterdam.
- confidence 0..1, eerlijk laag bij twijfel.
- Antwoord uitsluitend via het \`respond\`-tool. Bij twijfel: intent="conversation" met een goed antwoord — NOOIT stilvallen.`;
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
