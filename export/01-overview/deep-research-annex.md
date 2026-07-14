# Deep Research Annex — HoofdRust Assistent-Intelligentie

> Origineel automatisch onderzoeksrapport door de exploratie-subagent. Bewaard als bijlage voor de details die niet in de andere docs herhaald worden. Verwijst naar `src/...` paden uit het bronproject; in dit exportpakket vind je diezelfde bestanden onder `05-server-code/`.

---

## 1. Alle system/developer prompts (letterlijk, met locatie)

### 1.1 Hoofd-Brain system prompt — `src/lib/voice/process-voice-input.ts:364-446` (functie `systemPrompt`)

De enige echte "persoonlijkheids"-prompt van de assistent (gebruikt in `processVoiceInput`, het hart van de pipeline). Volledige tekst en JSON-tool-schema staan in `02-prompts/brain-system-prompt.md`.

Model: `google/gemini-3-flash-preview` (`process-voice-input.ts:27`), tool-forced via `respond`-function (`process-voice-input.ts:277-362`), temperature 0.4, harde timeout 6000ms in voice-mode (`VOICE_BRAIN_TIMEOUT_MS`, regel 33).

Persona wordt geïnjecteerd als `${persona.promptFragment}` direct na de eerste zin (regel 365, 371); context als `${contextSummary}` blok (regel 366-369).

### 1.2 Interne Reasoning-laag — `process-voice-input.ts:59-72`

Alleen in `mode:"test"` of `debug:true` — zie `02-prompts/reasoning-and-quality-prompts.md`.

### 1.3 Interne Quality-laag — `process-voice-input.ts:124-139`

Ook alleen in test-mode — zie `02-prompts/reasoning-and-quality-prompts.md`.

### 1.4 `ai-classify.functions.ts:12-33` — losstaand, ouder classificatiepad

Gebruikt door `classifyAndStoreSuggestion` (server fn, schrijft naar `ai_suggestions`). Niet aangesloten op de hoofd-Brain-pipeline. Zie `02-prompts/classify-system-prompt.md`.

### 1.5 Gift-event ideeën-generator — `assistant/experiences/gift-event.ts:114-120`

Zie `02-prompts/experiences/gift-event.md`.

### 1.6 Web-synthese-laag — `tools/web-synth.server.ts:105-114`

Zie `02-prompts/web-synth-prompt.md`.

### Bestanden zonder eigen system-prompt

- `conversation-engine.ts`, `memory-engine.ts`, `pipeline.ts`, `decision-engine.ts`, `execution-engine.ts`, `context-engine.ts`, `context-summary.ts`, `initiative-engine.ts`, `suggestion-engine.ts` — pure orchestratie/heuristiek, geen LLM-prompts.
- `experiences/continuation.ts`, `state-store.ts`, `spoken-summary.ts` — regex/templates.
- `handlers/*` — DB-CRUD + NL-tekstformattering.
- `persona.ts` / `load-persona.ts` — bouwen een NL-tekstfragment; geen LLM.
- `voice-confirm.functions.ts`, `brain-test.functions.ts` — orchestratie/testing.
- `speak.ts` — re-export naar `voice-service.ts`.
- `reminder-format.ts` — pure date-formatting.

---

## 2. Intent-herkenning

### Twee gescheiden classificatie-systemen naast elkaar

1. **Hoofd-Brain** — 10 product-intents (`conversation, advice, brainstorm, planning, calendar, reminder, shopping, todo, clarification, confirmation`), gemapt naar 7 VoiceIntents via `mapProductIntent()` (`process-voice-input.ts:452-467`).
2. **`ai-classify.functions.ts`** — direct `appointment | reminder | note | let_go` voor `ai_suggestions`-tabel.

`release`/`let_go` (loslaten) is een legacy `VoiceIntent` maar wordt niet meer door de LLM gekozen — alleen als fallback-default in `conversation-engine.ts:98`.

Zie `03-behavior-rules/intent-recognition.md` voor complete mapping en het volledige Brain-output JSON-schema.

**Herkomst-tabel:**

| Regel | Bron |
|---|---|
| "Behoefte eerst" ontwerpprincipe | prompt-tekst (§1.1) |
| `productIntent` → `VoiceIntent` mapping | code (`mapProductIntent`) |
| `actionRequired = action_required && suggested_actions.length>0` | code (regel 671) |
| Directe uitvoering zonder bevestiging ALLEEN als `!needsLiveInfo && actionRequired && !needsConfirmation` | code (regel 692) |
| Persona intent-bias bij dubbelzinnigheid | prompt-fragment gegenereerd door code (`persona.ts:174-178`) |
| Confirmable intents = `{reminder, event, note}` | code (`CONFIRM_INTENTS`) |
| Max acties = 3 | code (`MAX_ACTIONS`), maar prompt zegt "max 1 actie" |

---

## 3. Multi-intent per zin

**Ja, ondersteund** via `suggested_actions[]`, met caveats:

- Schema staat max 3 acties toe (`MAX_ACTIONS = 3`), prompt zegt "Max 1 actie" — **inconsistentie tussen schema-cap en prompt**.
- `dispatchVoiceBundle()` (`dispatch-voice-action.ts:23-63`): bij ≥1 confirmable actie worden **previews voor alle acties** gebouwd en als één `needs_confirmation`-bundel getoond. `commitVoiceBundle()` commit in volgorde **events-eerst-dan-reminders** (regel 116-124) zodat een reminder kan verwijzen naar `related_to_index` van een net aangemaakte appointment. Bij falen halverwege: **rollback** van eerder aangemaakte rijen (regel 176-189).
- Voorbeeldzin "zaterdag bezoek + vrijdag bloemen kopen" → twee `suggested_actions` (event zaterdag + reminder vrijdag), samen als één bevestigingskaart.
- **Disclaimer in code**: `dispatch-voice-action.ts:18-21` — "een release + reminder in één zin is zeldzaam; het model splitst dat zelden". Multi-intent-mix hangt af van of het model het zelf ziet.
- Legacy pipeline dedupliceert op `intent|iso_datetime/date|title` en capt op **max 2** (regel 566).

Voor de spec-fix zie `03-behavior-rules/multi-intent.md`.

---

## 4. Ontbrekende datum/tijd

### 4.1 Algemene clarificatie (LLM-gedreven, geen persistente state)
- Schema-veld `ambiguous` + `clarification_question` (regel 306-310).
- Wordt **niet actief opgevolgd** — gewoon als tekst in `assistant_chat`-payload meegegeven (regel 720-721). Geen "pending_clarification" DB-tabel.
- Handlers geven bij missende `title`/`date`/`iso_datetime`: `status:"failed"`, `error:"missing_fields"` (`handlers/event.ts:23-30`, `handlers/reminder.ts:10-17`).
- **Legacy pipeline vult automatisch slimme defaults in** i.p.v. te vragen: `deriveDefaultIso`, `deriveDefaultDate`, `deriveTitleFromTranscript` (`voice-pipeline.functions.ts:64-101`, 531-552). Reminder zonder tijd → 09:00 op afgeleide dag. Event zonder tijd → `start_time="09:00"`.

### 4.2 Experience-specifieke clarification met state — `gift_event`

Enige stuk met echte pending-state:
- `detectMissingField()` (`spoken-summary.ts:180-185`) checkt `age`/`interests`.
- Als iets ontbreekt én persona staat tegenvragen toe én `clarifyCount < MAX_CLARIFY_ROUNDS (2)`: `mode:"clarify"` met vraag via `buildClarifyQuestion`.
- State in `voice_experience_state` (15-min sliding window) via `saveExperienceState()`.
- Volgende turn: `looksLikeContinuation()` beslist heuristisch — bij match: geen LLM-call, direct extractie + merge.
- Na 2 clarify-ronden of alles bekend: `mode:"results"`, state gewist.

Voor de spec-fix (nooit datum verzinnen) zie `03-behavior-rules/missing-datetime.md`.

---

## 5. Bevestiging voor opslaan

Standaard consent-flow voor `reminder`, `event`, `note` — zie `03-behavior-rules/confirmation.md`.

Flow-samenvatting:
1. `dispatchVoiceBundle` bouwt previews, zet status `needs_confirmation`.
2. Pipeline persisteert bundle in `voice_actions` (`payload.actions`, `expires_at` = nu + 5 min).
3. UI toont kaart; gebruiker kan **overrides** meegeven — gevalideerd door `validateConfirm` (titel 1-200 tekens, `iso_datetime` in toekomst, `date`/`start_time` regexen).
4. `confirmVoiceAction` haalt rij op (moet `needs_confirmation` zijn, anders `"already_handled"`), past overrides toe op eerste `reminder`/`event`-actie, roept `commitVoiceBundle()`.
5. `cancelVoiceAction` → status `failed`/`error:"cancelled"`.
6. `getPendingVoiceAction` — meest recente niet-verlopen pending actie voor UI.

Directe uitvoering (Brain `needs_confirmation:false`, geen `needs_live_info`, regel 692) — maar `dispatchVoiceBundle` behandelt elke `reminder`/`event`/`note` sowieso als confirmable (`CONFIRM_INTENTS.has`). In de praktijk: elke DB-schrijfactie via `needs_confirmation`.

**Uitzondering:** `previewNote()` retourneert direct `status:"completed"` — geen echte confirm-stap voor losse notities buiten de bundle-preview.

---

## 6. Context / memory / persona

### 6.1 Persona

Kolommen uit `user_profiles` → `buildUserPersona()` (`persona.ts:135-193`) → `hints` + `promptFragment` (NL tekst in prompt) + `signature` (hash voor logging).

Geladen via `loadUserPersona()` op elke turn (geen caching).

### 6.2 Memory (`assistant_memory`)

- **Classificatie:** regex-only, 11 patronen — zie `02-prompts/memory-classifier-rules.md`.
- **Future Value Score:** categorie-basis met -0.45 penalty voor tijdelijkheids-markers, -0.1 voor lange waarden (`memory/future-value.ts`).
- **Drempel:** `futureValue × confidence >= 0.35` (`memory-engine.ts:120`).
- **Privacy:** "Niets opslaan zonder expliciete bevestiging. Geen ruwe transcripts in trace" (`memory-engine.ts:11-13`).
- **Bevestigingsflow:** `processMemoryForTurn()` (`memory-engine.ts:80-140`) — eerst ja/nee-check op openstaande `pending_confirmation`, anders extract → duplicate-check → nieuwe pending + natuurlijke vraag.
- **Actieve memories:** top 8 in `buildContextSummary()` als "Wat je eerder deelde: …" (`context-summary.ts:71-78`). Gift-event verrijkt cadeau-interesses uit memory (`gift-event.ts:256-278`).

### 6.3 Context Engine

`snapshot()` parallel: `appointments` (vandaag + komende 30), `reminders` (open, max 50), `ics_calendars` + `ics_events` (komende week). Berekent `nextEvent`, vrije tijdsblokken (08:00-22:00, min. 30 min), `upcomingBirthdaysCount`, categorie-tellingen (privacy-veilig, geen titels).

### 6.4 `voice_experience_state`

15-min sliding window voor lopende `gift_event`-experiences. RLS via `auth.uid()=user_id`. Migratie `20260629140530`.

### 6.5 History-window

Client stuurt `history: Array<{role,content}>`. Server capt op **laatste 6** (`process-voice-input.ts:489`). Reasoning-laag gebruikt slechts laatste 4 (regel 85).

---

## 7. Supabase-schema

**Belangrijk:** de repo bevat 17 kleine migratiebestanden — kerntabellen `appointments`, `reminders`, `notes`, `let_go_items`, `user_profiles`, `ai_suggestions`, `profiles`, `user_behavior_events` staan **niet** in de migrationsfolder (initiële Lovable-schema-push). Wij hebben ze live uit `information_schema` gelezen en samen met de bestaande migraties herschreven tot één schone recreate-migratie: `04-supabase/migrations/9999_full_schema_rebuild.sql`.

Alle originele migraties zijn 1-op-1 gekopieerd naar `04-supabase/migrations/` voor referentie.

Enums (bevestigd):
- `voice_intent`: `release, reminder, note, event, query, checkin, assistant_chat`
- `voice_action_status`: `completed, needs_confirmation, failed, skipped`
- `memory_category`: 14 waarden (zie enum-lijst in migratie)
- `memory_status`: `pending_confirmation, active, rejected, archived`
- `appointment_status`, `reminder_status`, `let_go_status`, `item_source`, `suggestion_status`

`set_updated_at()` functie + triggers op alle tabellen met `updated_at` kolom.

Zie `04-supabase/policies-summary.md` voor plain-language beschrijving per tabel.

---

## 8. Edge Function `text-to-speech`

- **Auth verplicht:** `Authorization: Bearer` header, geverifieerd via `supabase.auth.getUser()`.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (of `SUPABASE_PUBLISHABLE_KEY`), `ELEVENLABS_API_KEY`.
- **Voice whitelist:** 14 vaste ElevenLabs voice-IDs (Charlotte, Sarah/fallback, Alice, Lily, Laura, Matilda, Jessica, Brian, Daniel, George, Roger, Charlie, Liam, Will, Eric).
- **Fallback-voice:** Sarah (`EXAVITQu4vr4xnSDxMaL`) als requested voice niet toegestaan of primair faalt.
- **Modellen:** `eleven_flash_v2_5` (laagste latency, default) of `eleven_multilingual_v2` (beter NL).
- **Max tekst:** 1000 tekens.
- **Streaming:** `stream?output_format=mp3_44100_64&optimize_streaming_latency=2|3` als `audio/mpeg`, met debug-headers `x-voice-id`, `x-voice-model`, `x-voice-provider`, `x-voice-fallback`, `x-voice-requested`.
- **Bij falen:** JSON `{error:"tts_unavailable", fallback:true, upstream_status, ...}` met status 200.

Bron: `04-supabase/edge-functions/text-to-speech/index.ts`.

---

## 9. Environment variables

Volledig overzicht + labels in `07-env/ENVIRONMENT.md`. Template in `07-env/.env.example`.

---

## 10. Locatie / winkelsuggesties

- Trigger: Brain `needs_live_info:true` (nooit aparte intent — "onzichtbaar hulpmiddel").
- Flow: `webSearch(queries)` (Firecrawl, max 3 queries, 10 dedupped hits, winkel-detectie via hostname-regex `STORE_MAP` — AH, Jumbo, PLUS, Lidl, Aldi, Dirk, Hoogvliet, Coop, Vomar, Ekoplaza, Gall&Gall, Mitra, bol.com, Coolblue, MediaMarkt, HEMA, Action, IKEA — prijs via regex, OG-image enrichment met 3500ms timeout) → `synthesizeWithWeb()` (tweede LLM-call).
- **Geen automatische koppeling** aan reminders/notes. Losse server-fn `product-actions.functions.ts:addProductToShoppingList` zet product als **note** op expliciete user-actie (ProductCard-knop).
- Result in `PipelineResult.products` (los veld).

Voor de spec-fix ("koppel aan bestaande reminder") zie `03-behavior-rules/location-and-shopping.md`.

---

## 11. Agenda-overzicht

### 11.1 `handlers/query.ts` — expliciete agenda-vraag

- `rangeFor(scope, dateStr)` voor `today|tomorrow|this_week|next_week|specific_date` (week begint maandag).
- Parallel: `appointments` (`.eq(date range)`, order `date,start_time`), `reminders` (`status='active'`, `remind_at` in range), `ics_calendars`+`ics_events` (in range).
- Alle drie samengevoegd tot `QueryItem[]`, gesorteerd op geformatteerde `when`.
- **Persona-cap:** `items.slice(0, persona.hints.maxSuggestions)` — max 1-3 items met "ik laat de eerste N zien" bij afkap.
- Intro-tekst varieert per `tone`.

### 11.2 `context-engine.ts:snapshot()` — impliciete context voor elke turn

Gebruikt in `buildContextSummary()` voor `nextEvent`, `upcomingEvents` (max 10), vrije blokken en open reminders in system-prompt.

`detectAgendaQuery()` (`voice-pipeline.functions.ts:175-188`) — legacy shortcut: agenda-woord + vraagwoord → direct `handleQuery()` zonder LLM-call.

Voor de spec-fix (ICS-events samen tonen, natuurlijke tijdformattering) zie `03-behavior-rules/agenda-overview.md`.

---

## 12. Nederlands & tijden uitspreken

- `speak.ts` bevat geen formatting-logica — re-export naar `voice/voice-service.ts`.
- `reminder-format.ts:formatRemindAt()` — UI-tekst (niet TTS): "vandaag HH:MM", "morgen HH:MM", of "{weekday-kort} {dag} {maand-kort} HH:MM" via NL-locale — **cijfer-notatie "10:00"**, niet uitgeschreven.
- `experiences/spoken-summary.ts:formatDutchWhen()` — specifiek voor TTS: bij minuten "00" → "{weekday}ochtend om {uur zonder voorloopnul} uur" (bv. "zaterdagochtend om 9 uur"). Anders "{weekday} om HH:MM".
- `spoken-summary.ts:SPELLED` — leeftijden 1-12 uitgeschreven ("acht", "twaalf") voor natuurlijker TTS.
- Overige handlers (`event.ts`, `reminder.ts`, `query.ts`) gebruiken cijfertijd-notatie ("donderdag 14:00").

**Conclusie:** mix van cijfernotatie voor previews en uitgeschreven-uur-stijl alleen in gift-event. Geen generieke NL-tijd-naar-spraak-converter.

Voor de spec-fix (overal spreektaal, `formatDutchTime()` helper) zie `03-behavior-rules/dutch-language.md`.

---

## 13. Ongevraagde / proactieve suggesties

### 13.1 `initiative-engine.ts` — Opportunity Score (0-4), pure code-heuristiek

`shouldTakeInitiative()` regels (regel 50-171):
1. Primary intent ≠ `assistant_chat` → score 0, `reason:"direct_intent"`.
2. `gift_event`-experience → reden toegevoegd; clarify-modus → score 1, `allow:false`.
3. Persona `tone==="minimal"` of `maxSuggestions<=0` → score 1, `persona_quiet`.
4. Score-opbouw vanaf baseline 1:
   - +1 als LLM `suggested_actions` gaf.
   - gift_event met suggestie → min. score 3.
   - +1 bij toekomst-marker (morgen/vanavond/…/tijdstip).
   - +1 (max 4) bij "vergeet-marker" (vergeet/onthoud/denk eraan/herinner).
   - Agenda ≥4 afspraken → cap 2 (`agenda_is_busy`).
   - Classifier-confidence <0.4 → cap 1.
   - Geen actionable follow-up én score ≥3 → verlaag naar 2.
   - Persona `maxSuggestions===1` én score>2 → verlaag naar 2.
5. `allow = clamped_score >= 2`.

Score → `helpKind`: 0=`none`, 1=`advice_only`, 2=`advice_plus_suggestion`, 3=`advice_plus_followup`, 4=`advice_plus_multistep`.
Score → proposal-cap: ≤1 → 0 DB-voorstellen, 2-3 → 1, 4 → 2.

### 13.2 `suggestion-engine.ts` — vertaalt naar Proposals

- `conv.primary !== "assistant_chat"` → alle acties als Proposal met `rationale:"direct_intent"` (omzeilt score-cap).
- Anders: leest `primary.payload.suggested_actions`, filtert op `CONFIRMABLE` → `requiresConsent:true`, `rationale:"assistant_suggested"`.

### 13.3 `decision-engine.ts` — past cap toe

- `cap = min(personaCap, scoreToProposalCap(initiative.score))`.
- `direct_intent`-proposals omzeilen score-cap volledig.
- `assistant_suggested` geweigerd met reden `below_opportunity_threshold` (cap==0), `over_cap`, of `duplicate`.

**Trigger-moment voor ongevraagde suggesties:** alleen bij `assistant_chat`-antwoorden, score ≥2 — vereist dat LLM al zelf `suggested_actions` gaf (of gift_event met idee), tenzij agenda te druk of confidence te laag.

Voor de spec-fix (geen ongevraagde suggesties) zie `03-behavior-rules/proactive-suggestions.md`.
