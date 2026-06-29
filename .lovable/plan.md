# HoofdRust Intelligence Framework — Sprint 1

Doel: één centrale `assistant/` laag waar elke huidige en toekomstige Skill doorheen praat. We bouwen géén big-bang refactor — we leggen het fundament naast de bestaande voice-pipeline, verhuizen één skill als bewijs, en breken niets.

## Wat er al staat (hergebruiken)

| Bestaand | Rol in nieuwe model | Hergebruik |
|---|---|---|
| `src/lib/voice/process-voice-input.ts` (Gemini classifier + tools) | **Conversation Engine** (intent + behoefte) | Verhuist 1-op-1 achter een nieuw interface |
| `src/lib/voice/persona.ts` + `load-persona.ts` | **Memory Engine v0** (statische voorkeuren) | Wordt eerste memory-source; later aangevuld met dynamische leer-laag |
| `src/lib/voice/handlers/query.ts` (agenda/reminder ophalen) | **Context Engine v0** | Logica verhuist naar context-provider |
| `src/lib/voice/dispatch-voice-action.ts` (preview + commit bundle) | **Decision + Execution Engine** | Splitsen: beslissen (kies handler) vs uitvoeren (commit) |
| `voice_actions` tabel met `needs_confirmation` + `expires_at` | **Execution toestemming** | Ongewijzigd, blijft de toestemmings-gate |
| `voice_intents` log | Observability | Uitbreiden met engine-stappen |
| `src/lib/voice-pipeline.functions.ts` `runVoicePipeline` | Orchestrator | Blijft entry-point, krijgt nieuwe interne volgorde |
| `assistant_chat` intent + `suggested_actions` | Eerste vorm van **Suggestion Engine** | Generaliseren naar alle skills |

## Wat nieuw gebouwd wordt (klein, in deze sprint)

Eén nieuwe map `src/lib/assistant/` met dunne engines + duidelijke contracten. Geen UI-veranderingen, geen schema-veranderingen, geen migratie van bestaande tabellen.

```text
src/lib/assistant/
  types.ts                 # AssistantTurn, EngineContext, Proposal, Decision
  conversation-engine.ts   # wrapper rond processVoiceInput
  memory-engine.ts         # leest persona; stub voor write-back
  context-engine.ts        # tijd, agenda-snapshot, reminders-snapshot
  initiative-engine.ts     # mag/moet HoofdRust proactief iets opperen?
  suggestion-engine.ts     # genereert Proposal[] (event/reminder/note/...)
  decision-engine.ts       # kiest 0..n Proposals → Decision
  execution-engine.ts      # voert uit via bestaande handlers, respecteert consent
  pipeline.ts              # orchestrator: runAssistantTurn(input) → AssistantTurn
```

## Implementatieplan — kleine stappen

**Stap 1 · Contracten (geen gedragverandering)**
- Schrijf `src/lib/assistant/types.ts` met `EngineContext`, `Proposal`, `Decision`, `AssistantTurn`.
- Schrijf lege engine-modules die nu nog delegeren naar de bestaande voice-modules.
- Geen route- of UI-code raakt dit aan. Build moet groen blijven.

**Stap 2 · Orchestrator naast de oude**
- `runAssistantTurn()` in `assistant/pipeline.ts` roept de engines in volgorde: Conversation → Memory → Context → Initiative → Suggestion → Decision → Execution.
- `runVoicePipeline` blijft bestaan; intern roept hij `runAssistantTurn` aan. Output-shape (`PipelineResult`) blijft identiek — `voice-orb.tsx` en `voice-confirm.functions.ts` merken er niets van.

**Stap 3 · Skills verhuizen naar engine-call (proof)**
- Eén skill als bewijs: de bestaande `query`-handler wordt opnieuw ingericht zodat hij alleen `Context.snapshot()` + `Suggestion.format()` gebruikt — geen eigen AI-call.
- Bevestigt het patroon: een skill is een dunne adapter, intelligentie zit in de engines.
- Andere handlers (release, reminder, event, note, checkin, assistant_chat) blijven werken via de oude weg tot een latere sprint ze één voor één verhuist.

**Stap 4 · Memory write-back stub + observability**
- `memory-engine.ts` krijgt een `remember()` no-op met TODO + log; nog géén nieuwe tabel.
- `voice_intents.payload` krijgt extra veld `engine_trace` (welke engines actief waren, welke proposals, welke decision) — puur logging, geen schema-migratie nodig (`payload` is jsonb).

## Hoe we niets breken

- Alle bestaande files blijven staan, geen renames.
- Nieuwe code zit volledig in `src/lib/assistant/` en wordt alleen aangeroepen vanuit `runVoicePipeline`'s body.
- Output-contract `PipelineResult` is ongewijzigd → UI (`voice-orb`, `voice-query-result`, bevestigingskaart) blijft werken.
- `voice_actions` + `voice_intents` tabellen ongewijzigd; toestemmings-flow (`needs_confirmation` + `expires_at` + `confirmation_text`) blijft de execution-gate.
- Geen nieuwe afhankelijkheden, geen Edge Function, geen DB-migratie in deze sprint.

## Out of scope (latere sprints)

- Dynamische memory (leren van gedrag, eigen `assistant_memory` tabel).
- Proactieve trigger-bron buiten een spraak-turn (cron / context-events).
- Verhuizen van álle handlers naar engine-only.
- Nieuwe skills (cadeau, restaurant, kapper, vakantie) — pas zinvol als fundament staat.

## Resultaat van deze sprint

Een werkend fundament: zeven dunne engines, één orchestrator, één skill (`query`) die bewijst dat een Skill geen eigen AI-logica meer hoeft. Alle bestaande functionaliteit blijft 1-op-1 werken. Volgende sprints verhuizen telkens één skill of voegen één engine-capability toe.
