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
/**
 * Voice-first: snelheid en betrouwbaarheid gaan boven perfecte reasoning.
 * Tijdelijk teruggeschakeld van gemini-3.1-pro-preview (7–10s p50) naar
 * gemini-3-flash-preview zodat een volledige turn binnen 2–4s past.
 */
const MODEL = "google/gemini-3-flash-preview";
/** Snel, goedkoop model voor de interne reasoning-stap (nooit zichtbaar). */
const REASONING_MODEL = "google/gemini-3-flash-preview";
const MAX_ACTIONS = 3;

/** Harde deadline voor de hoofdcall in voice-mode — daarna fallback-reply. */
const VOICE_BRAIN_TIMEOUT_MS = 6000;
/** Zachte deadline voor optionele sub-calls (reasoning/quality) in test-mode. */
const OPTIONAL_STEP_TIMEOUT_MS = 4000;

/** Werp na `ms` een timeout-fout zodat we in de main-flow kunnen fallbacken. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Interne Reasoning Brain — nooit zichtbaar voor de gebruiker.
 * Beantwoordt 10 vaste vragen die de hoofd-Brain daarna gebruikt om
 * een beter, warmer en proactiever antwoord te geven.
 */
const REASONING_PROMPT = `Je bent de interne Reasoning-laag van HoofdRust. Deze output ziet de gebruiker NOOIT.

HOOGSTE ONTWERPREGEL
HoofdRust is geen agenda-assistent en geen opdracht-uitvoerder. HoofdRust helpt mensen mentale rust te creëren. Denk daarom NOOIT eerst in intents of acties. Denk in menselijke behoefte. Acties (reminder, agenda, boodschappenlijst, notitie) zijn nooit het doel — alleen een hulpmiddel als ze de gebruiker echt ontlasten.

Beantwoord in het Nederlands, kort (max 1 zin per punt), als genummerde lijst 1–7. Geen inleiding, geen afsluiting.

1. Wat is de echte behoefte achter deze vraag? (kijk voorbij de letterlijke woorden)
2. Welke context weet ik al over deze persoon? (agenda, memories, eerdere turns)
3. Wat zou een uitstekende persoonlijke assistent — die deze persoon al jaren kent — nu doen?
4. Hoe kan ik de mentale belasting van deze gebruiker verminderen?
5. Kan ik iets voorbereiden zodat de gebruiker minder hoeft na te denken? (concreet: keuze wegnemen, voorstel doen)
6. Is een vervolgvraag nodig, of maakt dat het juist zwaarder?
7. Pas NU: is een reminder, taak, agenda-item of boodschappenlijst écht nuttig? Zo ja welke, en waarom ontlast dat de gebruiker? Antwoord met "nee" als stap 1–5 dat niet ondersteunen.`;

async function runReasoning(
  userText: string,
  apiKey: string,
  contextSummary?: string | null,
  history: BrainHistoryEntry[] = [],
): Promise<string | null> {
  const contextBlock =
    contextSummary && contextSummary.trim() ? `\n\nCONTEXT:\n${contextSummary.trim()}` : "";
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: REASONING_PROMPT + contextBlock },
  ];
  for (const h of history.slice(-4)) {
    if (h?.content && (h.role === "user" || h.role === "assistant")) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: userText });

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({ model: REASONING_MODEL, messages, temperature: 0.3 }),
    });
    if (!res.ok) {
      console.warn("[reasoning] gateway", res.status);
      return null;
    }
    const json = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = json?.choices?.[0]?.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch (err) {
    console.warn("[reasoning] fetch error", err);
    return null;
  }
}



/**
 * Response Quality Layer — interne critique-pas.
 * Beoordeelt de concept-reply op 6 assen en levert desgewenst één verbeterde
 * versie. De gebruiker ziet dit proces nooit.
 */
const QUALITY_PROMPT = `Je bent de interne kwaliteitslaag van HoofdRust. Deze output ziet de gebruiker NOOIT. Je krijgt: de gebruikersvraag, de concept-reply, en optioneel interne redenering.

Beoordeel de concept-reply op:
1. Is de vraag volledig beantwoord?
2. Is de juiste context gebruikt?
3. Kan het natuurlijker/warmer klinken (spreektaal, Nederlands, kort)?
4. Is een kans gemist om behulpzaam te zijn?
5. Is het niet te opdringerig?
6. Past het bij HoofdRust: warm, slim, rustig, meedenkend, nooit belerend?

Antwoord UITSLUITEND met geldige JSON, exact dit schema:
{"ok": boolean, "improved_reply": string | null}

- ok=true als de reply prima is → improved_reply=null.
- ok=false als er duidelijk winst te halen is → geef één verbeterde reply in improved_reply (zelfde intentie, zelfde lengte-orde, geen nieuwe feiten verzinnen, geen acties toevoegen, natuurlijk Nederlands).
Geen uitleg, geen markdown, alleen de JSON.`;

async function runQualityCheck(
  userText: string,
  draftReply: string,
  apiKey: string,
  contextSummary?: string | null,
  reasoning?: string | null,
): Promise<string | null> {
  const parts = [
    `GEBRUIKERSVRAAG:\n${userText}`,
    `CONCEPT-REPLY:\n${draftReply}`,
  ];
  if (contextSummary?.trim()) parts.push(`CONTEXT:\n${contextSummary.trim()}`);
  if (reasoning?.trim()) parts.push(`INTERNE REDENERING:\n${reasoning.trim()}`);

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model: REASONING_MODEL,
        messages: [
          { role: "system", content: QUALITY_PROMPT },
          { role: "user", content: parts.join("\n\n") },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("[quality] gateway", res.status);
      return null;
    }
    const json = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    let parsed: { ok?: boolean; improved_reply?: string | null };
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
    if (parsed.ok === false && typeof parsed.improved_reply === "string") {
      const improved = parsed.improved_reply.trim();
      if (improved && improved !== draftReply.trim()) return improved;
    }
    return null;
  } catch (err) {
    console.warn("[quality] fetch error", err);
    return null;


}
}

type ClassifyMeta = {
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

export type BrainDebug = {
  transcript: string;
  contextSummary: string | null;
  reasoning: string | null;
  draftReply: string;
  qualityImproved: string | null;
  finalReply: string;
  intent: string;
  actionRequired: boolean;
  needsConfirmation: boolean;
  suggestedActions: Array<{ intent: string; payload: Record<string, unknown> }>;
  confidence: number;
  ambiguous: boolean;
  clarificationQuestion: string | null;
};

export type ClassifyResult = {
  actions: VoiceAction[];
  meta: ClassifyMeta;
  debug?: BrainDebug;
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
  /** Alleen voor Test Mode: retourneer de interne debug-trace. */
  debug?: boolean;
  /**
   * "voice"  → snelheid > alles: alleen hoofdcall, 6s harde timeout, fallback-reply.
   * "text"   → als voice, maar zonder harde 6s cap (mag iets langer duren).
   * "test"   → volledige pipeline inclusief reasoning + quality (voor /test-mode).
   * Default = "voice".
   */
  mode?: "voice" | "text" | "test";
  /** Optionele expliciete overrides. Alleen zinvol in test-mode. */
  enableReasoning?: boolean;
  enableQuality?: boolean;
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

  const history = Array.isArray(opts.history) ? opts.history.slice(-6) : [];

  // Voice-first: reasoning + quality staan default UIT (kostten samen ~5–7s).
  // Alleen in test-mode (of expliciete override) draaien ze mee.
  const mode = opts.mode ?? "voice";
  const enableReasoning =
    opts.enableReasoning ?? (mode === "test" || !!opts.debug);
  const enableQuality =
    opts.enableQuality ?? (mode === "test" || !!opts.debug);
  const isVoice = mode === "voice";

  // Stap 1: interne Reasoning Brain — alleen als expliciet aangezet.
  //         Nooit zichtbaar voor de gebruiker; timeout hard begrensd.
  let reasoning: string | null = null;
  if (enableReasoning) {
    try {
      reasoning = await withTimeout(
        runReasoning(trimmed, apiKey, opts.contextSummary, history),
        OPTIONAL_STEP_TIMEOUT_MS,
        "reasoning",
      );
    } catch (err) {
      console.warn("[brain] reasoning skipped:", (err as Error).message);
      reasoning = null;
    }
  }

  // Stap 2: hoofdantwoord — injecteer reasoning als extra system-context.
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt(nowIso, persona, opts.contextSummary) },
  ];
  if (reasoning) {
    messages.push({
      role: "system",
      content: `INTERNE REDENERING (niet uitspreken, niet noemen — gebruik als denkkader voor je reply):\n${reasoning}`,
    });
  }
  for (const h of history) {
    if (!h?.content) continue;
    if (h.role === "user" || h.role === "assistant") {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: trimmed });

  // In voice-mode koppelen we een AbortController aan de hoofdcall zodat we
  // NOOIT langer dan VOICE_BRAIN_TIMEOUT_MS wachten. Bij timeout → snelle
  // fallback-reply zodat de orb altijd iets zegt.
  const controller = isVoice ? new AbortController() : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort(), VOICE_BRAIN_TIMEOUT_MS)
    : null;

  const t_llm = performance.now();
  const promptChars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
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
      signal: controller?.signal,
    });
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const aborted = (err as { name?: string })?.name === "AbortError";
    console.error("[brain] gateway fetch error", aborted ? "timeout" : err);
    return chatFallback(
      aborted
        ? "Ik heb je wel gehoord, maar het duurde even te lang. Zeg het gerust nog een keer."
        : "Er ging even iets mis met mijn verbinding. Probeer het zo opnieuw.",
    );
  }
  if (timeoutHandle) clearTimeout(timeoutHandle);
  const llm_headers_ms = Math.round(performance.now() - t_llm);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[brain] gateway", res.status, body.slice(0, 300));
    return chatFallback("Ik kreeg geen goed antwoord terug. Wil je het nog eens proberen?");
  }

  type GatewayResp = {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const t_body = performance.now();
  const json = (await res.json().catch(() => null)) as GatewayResp | null;
  const llm_body_ms = Math.round(performance.now() - t_body);
  const llm_total_ms = Math.round(performance.now() - t_llm);
  console.log("[perf brain]", {
    model: MODEL,
    mode,
    prompt_chars: promptChars,
    prompt_tokens: json?.usage?.prompt_tokens,
    completion_tokens: json?.usage?.completion_tokens,
    llm_headers_ms,
    llm_body_ms,
    llm_total_ms,
  });

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

  let reply = (parsed.reply ?? "").trim();
  if (!reply) {
    return chatFallback("Ik heb je gehoord — vertel eens iets meer, dan denk ik met je mee.");
  }

  // Response Quality Layer — alleen als expliciet aangezet (test-mode).
  // In voice-mode overslaan we deze om binnen de 2–4s target te blijven.
  let improved: string | null = null;
  if (enableQuality) {
    try {
      improved = await withTimeout(
        runQualityCheck(trimmed, reply, apiKey, opts.contextSummary, reasoning),
        OPTIONAL_STEP_TIMEOUT_MS,
        "quality",
      );
    } catch (err) {
      console.warn("[brain] quality skipped:", (err as Error).message);
      improved = null;
    }
    if (improved) reply = improved;
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


  const debug: BrainDebug | undefined = opts.debug
    ? {
        transcript: trimmed,
        contextSummary: opts.contextSummary ?? null,
        reasoning: reasoning ?? null,
        draftReply: (parsed.reply ?? "").trim(),
        qualityImproved: improved ?? null,
        finalReply: reply,
        intent: productIntent,
        actionRequired,
        needsConfirmation,
        suggestedActions: suggestedActions.map((s) => ({ intent: s.intent, payload: s.payload })),
        confidence,
        ambiguous: !!parsed.ambiguous,
        clarificationQuestion: parsed.clarification_question?.trim() || null,
      }
    : undefined;

  return {
    actions,
    meta: {
      model: MODEL,
      prompt_tokens: json?.usage?.prompt_tokens ?? null,
      completion_tokens: json?.usage?.completion_tokens ?? null,
      total_tokens: json?.usage?.total_tokens ?? null,
    },
    debug,
  };
}
