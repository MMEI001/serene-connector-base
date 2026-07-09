// NOTE: deze orchestrator delegeert sinds Sprint 2 een SMALLE subset
// (assistant_chat zonder DB-acties) aan runAssistantTurn() uit
// src/lib/assistant/pipeline.ts (HoofdRust Intelligence Framework).
// Alle overige intents lopen ongewijzigd via deze legacy-pipeline tot
// elke engine behavior-parity heeft met de slimme defaults hieronder.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processVoiceInput } from "@/lib/voice/process-voice-input";
import { dispatchVoiceBundle } from "@/lib/voice/dispatch-voice-action";
import { handleQuery } from "@/lib/voice/handlers/query";
import { loadUserPersona } from "@/lib/voice/load-persona";
import type { PipelineResult, VoiceAction, VoiceIntent } from "@/lib/voice/types";
import { runAssistantTurn } from "@/lib/assistant/pipeline";
import {
  isEligibleForAssistantLayer,
  resolveAssistantMode,
} from "@/lib/assistant/flags";
import type { EngineTrace } from "@/lib/assistant/types";

const CONFIRMABLE_SUGGESTED: ReadonlySet<VoiceIntent> = new Set(["reminder", "event", "note"]);

const NL_WEEKDAYS: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3,
  donderdag: 4, vrijdag: 5, zaterdag: 6,
};

/** Bouw een Europe/Amsterdam ISO string voor een gegeven datum + HH:mm. */
function amsterdamIso(year: number, month: number, day: number, hour = 9, minute = 0): string {
  // Bepaal of NL op zomertijd zit (DST: laatste zondag maart 02:00 → laatste zondag oktober 03:00).
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  const d = new Date(utc);
  // Probeer offset af te leiden via Intl
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam", timeZoneName: "shortOffset",
  });
  const parts = dtf.formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = tz.match(/GMT([+-]\d+)/);
  const offsetHours = m ? parseInt(m[1], 10) : 1;
  const sign = offsetHours >= 0 ? "+" : "-";
  const oh = String(Math.abs(offsetHours)).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${oh}:00`;
}

/** Vind volgende voorkomen van een NL weekdag (vandaag telt mee als true). */
function nextWeekday(from: Date, target: number, includeToday = true): Date {
  const d = new Date(from);
  const cur = d.getDay();
  let delta = (target - cur + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/**
 * Leid een default reminder-ISO af uit de oorspronkelijke transcript.
 * - "zaterdag"/"zondag" → werkdag (vrijdag) ervóór 09:00.
 * - "maandag..vrijdag" → één dag eerder 09:00 (min. morgen).
 * - "morgen" → morgen 09:00.
 * - "overmorgen" → overmorgen 09:00.
 * - fallback → morgen 09:00.
 */
function deriveDefaultIso(transcript: string): string {
  const text = transcript.toLowerCase();
  const now = new Date();
  let target: Date | null = null;

  if (/\bovermorgen\b/.test(text)) {
    target = new Date(now); target.setDate(now.getDate() + 2);
  } else if (/\bmorgen\b/.test(text)) {
    target = new Date(now); target.setDate(now.getDate() + 1);
  } else {
    for (const [name, dow] of Object.entries(NL_WEEKDAYS)) {
      if (new RegExp(`\\b${name}\\b`).test(text)) {
        const eventDay = nextWeekday(now, dow, false);
        // Zet reminder op werkdag ervóór (anders 1 dag eerder, min. morgen).
        const reminder = new Date(eventDay);
        if (dow === 0 /* zondag */ || dow === 6 /* zaterdag */) {
          // Spring terug naar vrijdag
          const back = dow === 6 ? 1 : 2;
          reminder.setDate(eventDay.getDate() - back);
        } else {
          reminder.setDate(eventDay.getDate() - 1);
        }
        // Niet in het verleden of vandaag → minstens morgen
        const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        if (reminder < tomorrow) reminder.setTime(tomorrow.getTime());
        target = reminder;
        break;
      }
    }
  }

  if (!target) {
    target = new Date(now); target.setDate(now.getDate() + 1);
  }

  return amsterdamIso(target.getFullYear(), target.getMonth() + 1, target.getDate(), 9, 0);
}

function deriveDefaultDate(transcript: string): { date: string; iso: string } {
  const iso = deriveDefaultIso(transcript);
  // YYYY-MM-DD uit het ISO-prefix
  return { date: iso.slice(0, 10), iso };
}

function deriveTitleFromReply(reply: string): string {
  // Pak laatste imperatieve hint, anders eerste 6 woorden.
  const cleaned = reply.replace(/[?!.,]/g, " ").trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return words || "Herinnering";
}

const ACTION_VERBS = [
  "kopen", "halen", "bellen", "sturen", "regelen", "brengen", "maken",
  "boeken", "reserveren", "plannen", "afspreken", "bestellen", "ophalen",
  "schrijven", "mailen", "appen", "betalen", "inpakken", "bezoeken",
];

/** Leid een korte actie-titel af uit het transcript van de gebruiker. */
function deriveTitleFromTranscript(transcript: string): string {
  const text = transcript.toLowerCase().replace(/[?!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "Herinnering";
  const tokens = text.split(" ");
  // Zoek "<woord(en)> <werkwoord>" patroon (max 3 woorden vóór werkwoord).
  for (let i = 0; i < tokens.length; i++) {
    if (ACTION_VERBS.includes(tokens[i])) {
      const start = Math.max(0, i - 2);
      const phrase = tokens.slice(start, i + 1).join(" ");
      return capitalize(phrase);
    }
  }
  // Geen werkwoord-match → fallback op kernwoord (eerste zelfstandig nw na "een"/"de"/"het" of "mijn").
  const articleIdx = tokens.findIndex((t) => ["een", "de", "het", "mijn", "m'n"].includes(t));
  if (articleIdx >= 0 && tokens[articleIdx + 1]) {
    return capitalize(tokens.slice(articleIdx + 1, articleIdx + 3).join(" "));
  }
  return "Herinnering";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function todayIsoAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function nextDutchWeekdayDate(text: string): string | null {
  const lower = text.toLowerCase();
  const hit = Object.entries(NL_WEEKDAYS).find(([name]) => new RegExp(`\\b${name}\\b`, "i").test(lower));
  if (!hit) return null;
  const [, target] = hit;
  const todayIso = todayIsoAmsterdam();
  const probe = new Date(`${todayIso}T12:00:00`);
  const current = probe.getDay();
  let delta = (target - current + 7) % 7;
  if (delta === 0 && !/\b(vandaag|deze\s+dag)\b/i.test(lower)) delta = 7;
  return addDaysIso(todayIso, delta);
}

function detectAgendaQuery(text: string): { scope: "today" | "tomorrow" | "this_week" | "next_week" | "specific_date"; date?: string } | null {
  const lower = text.toLowerCase();
  const asksAgenda = /\b(agenda|planning|plan|te doen|staat er|afspraak|afspraken)\b/i.test(lower);
  const asksQuestion = /\b(wat|wanneer|hoe laat|heb ik|staat|staan|planning)\b/i.test(lower);
  if (!asksAgenda || !asksQuestion) return null;
  if (/\bovermorgen\b/i.test(lower)) return { scope: "specific_date", date: addDaysIso(todayIsoAmsterdam(), 2) };
  if (/\bmorgen\b/i.test(lower)) return { scope: "tomorrow" };
  if (/\bvolgende week\b/i.test(lower)) return { scope: "next_week" };
  if (/\b(deze week|week)\b/i.test(lower)) return { scope: "this_week" };
  const weekdayDate = nextDutchWeekdayDate(lower);
  if (weekdayDate) return { scope: "specific_date", date: weekdayDate };
  if (/\bvandaag\b/i.test(lower)) return { scope: "today" };
  return null;
}

/** Trek concrete suggesties uit een assistant_reply en formatteer als "Suggesties: …". */
function extractSuggestionsFromReply(reply: string): string | null {
  if (!reply) return null;
  const text = reply.replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:denken aan|denk aan|voorstellen|overweeg(?:en)?)\s+([^.!?]+)/i,
    /\bbijvoorbeeld\s+([^.!?]+)/i,
    /\bzoals\s+([^.!?]+)/i,
  ];
  let phrase: string | null = null;
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) { phrase = m[1].trim(); break; }
  }
  if (!phrase) return null;
  phrase = phrase.replace(/\s+(ik kan|ik zou|wil je|zal ik)\b.*$/i, "").trim();
  phrase = phrase.replace(/[,;:\s]+$/g, "");
  if (phrase.length < 3) return null;
  const MAX = 140;
  if (phrase.length > MAX) {
    const cut = phrase.slice(0, MAX);
    const lastSpace = cut.lastIndexOf(" ");
    phrase = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + "…";
  }
  return `Suggesties: ${phrase}.`;
}

const MIN_WORDS = 2;
const PENDING_TTL_MS = 5 * 60 * 1000;

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export const runVoicePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      text: string;
      transcription_id?: string | null;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    }) => ({
      text: typeof data?.text === "string" ? data.text : "",
      transcription_id:
        typeof data?.transcription_id === "string" ? data.transcription_id : null,
      history: Array.isArray(data?.history)
        ? data.history
            .filter(
              (h): h is { role: "user" | "assistant"; content: string } =>
                !!h &&
                (h.role === "user" || h.role === "assistant") &&
                typeof h.content === "string" &&
                !!h.content.trim(),
            )
            .slice(-6)
        : [],
    }),
  )
  .handler(async ({ data, context }): Promise<PipelineResult> => {
    const { supabase, userId } = context;
    const text = data.text.trim();

    if (!text || wordCount(text) < MIN_WORDS) {
      return { intent: "release", status: "skipped", confirmation: "" };
    }

    // Sprint 2 — legacy mini-trace (privacy-veilig: geen transcript/titels/datums).
    const pipelineStart = performance.now();
    const legacyTurnId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `legacy_${Date.now()}`;
    const buildLegacyTrace = (): EngineTrace => ({
      framework: "legacy",
      turn_id: legacyTurnId,
      total_ms: Math.round(performance.now() - pipelineStart),
      slowest_engine: "legacy_pipeline",
    });

    // 0. Persona laden uit user_profiles (RLS-actief via supabase-client van auth-middleware)
    const t_persona = performance.now();
    const persona = await loadUserPersona(supabase, userId);
    const persona_ms = Math.round(performance.now() - t_persona);

    const directAgendaQuery = detectAgendaQuery(text);
    if (directAgendaQuery) {
      const result = await handleQuery(supabase ? { supabase, userId } : { supabase, userId }, directAgendaQuery, persona);
      return { ...result, engine_trace: buildLegacyTrace() };
    }

    // 1. GPT-classify → 1..3 actions (persona stuurt toon + intent-bias)
    //    Brain-laag krijgt de conversation history en (later) contextsamenvatting.
    const t_brain = performance.now();
    const { actions: classified, meta } = await processVoiceInput(text, persona, {
      history: data.history,
    });
    const brain_ms = Math.round(performance.now() - t_brain);
    console.log("[perf server]", {
      turn: legacyTurnId.slice(0, 8),
      persona_ms,
      brain_ms,
      text_len: text.length,
      history_len: data.history.length,
    });
    const primary = classified[0];

    // 1a. WEB-INFORMATIE — Firecrawl als onzichtbaar hulpmiddel.
    //     De Brain heeft besloten dat actuele externe info nodig is; wij halen
    //     die op en laten een tweede model-call een natuurlijk antwoord +
    //     uniforme product-cards genereren. Geen aparte intent voor de UI.
    if (
      primary?.intent === "assistant_chat" &&
      primary.payload.needs_live_info === true
    ) {
      const queriesRaw = primary.payload.live_queries;
      const queries = Array.isArray(queriesRaw)
        ? queriesRaw.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        : [];
      const t_web = performance.now();
      const { webSearch } = await import("@/lib/tools/web-search.server");
      const { synthesizeWithWeb } = await import("@/lib/tools/web-synth.server");
      const hits = queries.length > 0 ? await webSearch(queries) : [];
      const web_ms = Math.round(performance.now() - t_web);

      let reply: string;
      let products: PipelineResult["products"] = undefined;
      if (hits.length === 0) {
        reply =
          "Ik kan actuele informatie hierover nu niet ophalen, maar ik denk graag met je mee — vertel eens wat je zoekt.";
      } else {
        const t_synth = performance.now();
        const synth = await synthesizeWithWeb(text, hits);
        const synth_ms = Math.round(performance.now() - t_synth);
        console.log("[perf web]", { queries, hits: hits.length, web_ms, synth_ms });
        const synthReply = synth.reply?.trim();
        reply =
          synthReply && synthReply.length > 0
            ? synthReply
            : "Ik heb een paar opties voor je gevonden. Ik zet ze hieronder klaar — wil je er één op je boodschappenlijst?";
        products = synth.products;
      }

      supabase
        .from("voice_intents")
        .insert({
          user_id: userId,
          transcription_id: data.transcription_id,
          model: meta.model,
          intent: "assistant_chat",
          confidence: primary.confidence,
          payload: {
            actions: classified,
            persona_signature: persona.signature,
            web: { queries, hits_count: hits.length, products_count: products?.length ?? 0 },
          } as never,
          prompt_tokens: meta.prompt_tokens,
          completion_tokens: meta.completion_tokens,
          total_tokens: meta.total_tokens,
        })
        .then(({ error }) => {
          if (error) console.error("[pipeline:web] log", error);
        });

      return {
        intent: "assistant_chat",
        status: "completed",
        confirmation: reply,
        assistant_reply: reply,
        products,
        engine_trace: buildLegacyTrace(),
      };
    }


    try {
      const mode = await resolveAssistantMode(supabase, userId);
      const suggestedRaw = primary?.payload.suggested_actions;
      const hasSuggested =
        Array.isArray(suggestedRaw) && suggestedRaw.length > 0;
      const hasExperience = primary?.payload.experience === "gift_event";

      // Lichte state-check voor continuation-routing.
      let hasActiveExperience = false;
      if (primary && !hasExperience && mode !== "off") {
        const { data: stateRow } = await supabase
          .from("voice_experience_state")
          .select("expires_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (stateRow?.expires_at && new Date(stateRow.expires_at).getTime() > Date.now()) {
          hasActiveExperience = true;
        }
      }

      if (
        primary &&
        (isEligibleForAssistantLayer(mode, primary.intent, hasSuggested, hasExperience) ||
          hasActiveExperience)
      ) {

        const { result: assistantResult, trace, chosenActions } = await runAssistantTurn(
          supabase,
          userId,
          { text, transcription_id: data.transcription_id, history: data.history },
        );
        // Audit-log voor de framework-turn met volledige trace.
        supabase
          .from("voice_intents")
          .insert({
            user_id: userId,
            transcription_id: data.transcription_id,
            model: meta.model,
            intent: primary.intent,
            confidence: primary.confidence,
            payload: {
              actions: classified,
              persona_signature: persona.signature,
              engine_trace: trace,
            } as never,
            prompt_tokens: meta.prompt_tokens,
            completion_tokens: meta.completion_tokens,
            total_tokens: meta.total_tokens,
            ambiguous: classified.some((a) => !!a.ambiguous),
            clarification_question: null,
          })
          .then(({ error }) => {
            if (error) console.error("[pipeline:assistant] log", error);
          });

        // needs_confirmation → persisteer bundle + action_id zodat UI bevestigingskaart toont.
        if (assistantResult.status === "needs_confirmation" && chosenActions.length > 0) {
          const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
          const { data: row, error: insErr } = await supabase
            .from("voice_actions")
            .insert({
              user_id: userId,
              transcription_id: data.transcription_id,
              intent: primary.intent,
              payload: { actions: chosenActions } as never,
              status: "needs_confirmation",
              confirmation_text: assistantResult.preview ?? assistantResult.confirmation,
              expires_at: expiresAt,
            })
            .select("id")
            .single();

          if (insErr || !row) {
            return {
              intent: primary.intent,
              status: "failed",
              confirmation: "Kon de bevestiging niet voorbereiden.",
              error: insErr?.message ?? "pending insert failed",
              engine_trace: trace,
            };
          }
          let editable: PipelineResult["editable"] | undefined;
          if (chosenActions.length === 1) {
            const a = chosenActions[0];
            if (a.intent === "reminder") {
              editable = {
                intent: "reminder",
                title: String(a.payload.title ?? ""),
                iso_datetime: typeof a.payload.iso_datetime === "string" ? a.payload.iso_datetime : undefined,
              };
            } else if (a.intent === "event") {
              editable = {
                intent: "event",
                title: String(a.payload.title ?? ""),
                date: typeof a.payload.date === "string" ? a.payload.date : undefined,
                start_time: typeof a.payload.start_time === "string" ? a.payload.start_time : undefined,
              };
            } else if (a.intent === "note") {
              editable = {
                intent: "note",
                title: String(a.payload.title ?? a.payload.text ?? a.payload.content ?? ""),
              };
            }
          }
          return {
            ...assistantResult,
            action_id: row.id as string,
            expires_at: expiresAt,
            editable,
          };
        }

        // completed/failed → audit-log
        if (assistantResult.status === "completed" || assistantResult.status === "failed") {
          const { error: logErr } = await supabase.from("voice_actions").insert({
            user_id: userId,
            transcription_id: data.transcription_id,
            intent: primary.intent,
            payload: { actions: chosenActions } as never,
            result_table: assistantResult.ref?.table ?? null,
            result_id: assistantResult.ref?.id ?? null,
            status: assistantResult.status,
            error: assistantResult.error ?? null,
            confirmation_text: assistantResult.confirmation,
          });
          if (logErr) console.error("[pipeline:assistant] audit log", logErr);
        }

        return assistantResult;
      }

    } catch (err) {
      console.warn(
        "[pipeline] assistant-layer failed, falling back to legacy",
        err,
      );
    }

    // 1b. assistant_chat: pak korte reply + (optionele) vervolgacties uit.
    //     Vervolgacties worden NOOIT direct uitgevoerd — ze gaan via de
    //     bestaande needs_confirmation / commitVoiceBundle-flow.
    let assistantReply: string | null = null;
    let actions: VoiceAction[] = classified;
    // Reply zit ALTIJD op primary.payload.reply (Brain garandeert dat), ongeacht
    // of het intent assistant_chat, note, reminder of event is. Zonder deze
    // hoisting krijgt de UI/TTS voor direct-uitgevoerde acties geen
    // assistant_reply mee en valt de gesproken uitleg weg.
    {
      const anyReplyRaw = primary?.payload?.reply;
      if (typeof anyReplyRaw === "string" && anyReplyRaw.trim()) {
        assistantReply = anyReplyRaw.trim();
      }
    }
    if (primary?.intent === "assistant_chat") {
      if (!assistantReply) assistantReply = "Ik denk met je mee.";
      const suggestedRaw = primary.payload.suggested_actions;
      const suggested: VoiceAction[] = Array.isArray(suggestedRaw)
        ? suggestedRaw
            .map((s): VoiceAction | null => {
              if (!s || typeof s !== "object") return null;
              const obj = s as { intent?: unknown; payload?: unknown };
              const intent = typeof obj.intent === "string" ? (obj.intent as VoiceIntent) : null;
              if (!intent || !CONFIRMABLE_SUGGESTED.has(intent)) return null;
              const payload = obj.payload && typeof obj.payload === "object"
                ? { ...(obj.payload as Record<string, unknown>) }
                : {};

              // Vul slimme defaults in zodat preview niet faalt op ontbrekende velden.
              const titleFromTranscript = deriveTitleFromTranscript(text);
              if (intent === "reminder") {
                const iso = typeof payload.iso_datetime === "string" ? payload.iso_datetime : "";
                const validIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso);
                if (!validIso) payload.iso_datetime = deriveDefaultIso(text);
                const title = typeof payload.title === "string" ? payload.title.trim() : "";
                if (!title) payload.title = titleFromTranscript;
              } else if (intent === "event") {
                const date = typeof payload.date === "string" ? payload.date : "";
                const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
                if (!validDate) {
                  const d = deriveDefaultDate(text);
                  payload.date = d.date;
                }
                if (!payload.start_time) payload.start_time = "09:00";
                const title = typeof payload.title === "string" ? payload.title.trim() : "";
                if (!title) payload.title = titleFromTranscript;
              } else if (intent === "note") {
                const t = typeof payload.text === "string" ? payload.text.trim() : "";
                if (!t) payload.text = assistantReply ?? titleFromTranscript;
              }

              return { intent, payload, confidence: 0.7 };
            })
            .filter((x): x is VoiceAction => !!x)
        : [];
      // Dedupe op intent + tijd + titel; cap op max 2.
      const seen = new Set<string>();
      const deduped: VoiceAction[] = [];
      for (const a of suggested) {
        const key = `${a.intent}|${String(a.payload.iso_datetime ?? a.payload.date ?? "")}|${String(a.payload.title ?? a.payload.text ?? "").toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(a);
        if (deduped.length >= 2) break;
      }
      // Verrijk acties met subtiele suggestie-subtekst uit de assistant_reply.
      const subtext = extractSuggestionsFromReply(assistantReply);
      if (subtext) {
        for (const a of deduped) {
          if (a.intent === "reminder") {
            const cur = typeof a.payload.description === "string" ? a.payload.description.trim() : "";
            if (!cur) a.payload.description = subtext;
          } else if (a.intent === "event") {
            const cur = typeof a.payload.notes === "string" ? a.payload.notes.trim() : "";
            if (!cur) a.payload.notes = subtext;
          }
        }
      }
      if (deduped.length > 0) {
        actions = deduped;
      } else {
        actions = [primary];
      }
    }

    // 2. Log intent-classificatie (één rij per zin, met alle (originele) actions in payload)
    supabase
      .from("voice_intents")
      .insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        model: meta.model,
        intent: primary.intent,
        confidence: primary.confidence,
        payload: {
          actions: classified,
          persona_signature: persona.signature,
          engine_trace: buildLegacyTrace(),
        } as never,
        prompt_tokens: meta.prompt_tokens,
        completion_tokens: meta.completion_tokens,
        total_tokens: meta.total_tokens,
        ambiguous: classified.some((a) => !!a.ambiguous),
        clarification_question:
          classified.find((a) => a.clarification_question)?.clarification_question ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[pipeline] voice_intents log", error);
      });


    // 3. Dispatch bundle (persona doorgegeven voor query-handler caps + toon)
    let result = await dispatchVoiceBundle({ supabase, userId, persona }, actions);

    // 3a. Failsafe: bij assistant_chat met gefaalde suggested actions, val terug
    //     op alleen het adviserende antwoord — gebruiker hoort dan minimaal de tip.
    if (assistantReply && result.status === "failed" && primary?.intent === "assistant_chat") {
      console.warn("[pipeline] assistant_chat suggested actions failed, falling back to reply-only", result.error);
      actions = [primary];
      result = await dispatchVoiceBundle({ supabase, userId, persona }, actions);
    }

    // 3b. assistant_chat reply altijd meesturen voor TTS/UI.
    if (assistantReply) {
      result.assistant_reply = assistantReply;
      // Voor needs_confirmation: laat de reply leidend zijn in de gesproken intro.
      if (result.status === "needs_confirmation") {
        result.confirmation = assistantReply;
      } else if (result.status === "completed" && !result.query_result) {
        result.confirmation = assistantReply;
      }
    }

    if (result.status === "skipped") return { ...result, engine_trace: buildLegacyTrace() };

    // 4a. needs_confirmation → bewaar hele bundle in voice_actions.payload.actions
    if (result.status === "needs_confirmation") {
      const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
      const { data: row, error } = await supabase
        .from("voice_actions")
        .insert({
          user_id: userId,
          transcription_id: data.transcription_id,
          intent: primary.intent,
          payload: { actions } as never,
          status: "needs_confirmation",
          confirmation_text: result.preview ?? result.confirmation,
          expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (error || !row) {
        return {
          intent: primary.intent,
          status: "failed",
          confirmation: "Kon de bevestiging niet voorbereiden.",
          error: error?.message ?? "pending insert failed",
          engine_trace: buildLegacyTrace(),
        };
      }
      // Bewerkbare velden: alleen bij precies één confirmable actie.
      let editable: PipelineResult["editable"] | undefined;
      if (actions.length === 1) {
        const a = actions[0];
        if (a.intent === "reminder") {
          editable = {
            intent: "reminder",
            title: String(a.payload.title ?? ""),
            iso_datetime: typeof a.payload.iso_datetime === "string" ? a.payload.iso_datetime : undefined,
          };
        } else if (a.intent === "event") {
          editable = {
            intent: "event",
            title: String(a.payload.title ?? ""),
            date: typeof a.payload.date === "string" ? a.payload.date : undefined,
            start_time: typeof a.payload.start_time === "string" ? a.payload.start_time : undefined,
          };
        } else if (a.intent === "note") {
          editable = {
            intent: "note",
            title: String(a.payload.title ?? a.payload.text ?? a.payload.content ?? ""),
          };
        }
      }
      return {
        ...result,
        action_id: row.id as string,
        expires_at: expiresAt,
        editable,
        engine_trace: buildLegacyTrace(),
      };
    }

    // 4b. completed/failed → audit-log
    if (result.status === "completed" || result.status === "failed") {
      const { error: logErr } = await supabase.from("voice_actions").insert({
        user_id: userId,
        transcription_id: data.transcription_id,
        intent: primary.intent,
        payload: { actions } as never,
        result_table: result.ref?.table ?? null,
        result_id: result.ref?.id ?? null,
        status: result.status,
        error: result.error ?? null,
        confirmation_text: result.confirmation,
      });
      if (logErr) console.error("[pipeline] audit log", logErr);
    }

    return { ...result, engine_trace: buildLegacyTrace() };
  });

