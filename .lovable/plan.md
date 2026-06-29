# Sprint 2 — Narrow rollout + Reasoning Trace

Doel: één smalle, read-only flow (assistant_chat zonder DB-acties) loopt door het nieuwe Intelligence Framework, en élke AssistantTurn levert een rijke, privacy-veilige `EngineTrace` op die we live in een debug-paneel kunnen bekijken.

## Stap 1 · Feature flag + narrow routing

- Server-side flag in `src/lib/assistant/flags.ts`:
  - `ASSISTANT_FRAMEWORK` = `off` | `chat_only` | `full` (default `chat_only` in dev, `off` in prod).
  - Per-user override via `user_profiles.assistant_framework_mode` (optioneel veld, nullable) zodat we testers selectief kunnen opnemen.
- In `runVoicePipeline`: na de Conversation-classify, als flag actief is **én** `primary === "assistant_chat"` **én** geen `suggested_actions` met DB-impact → roep `runAssistantTurn` aan en geef diens result terug. Alle andere paden ongewijzigd.
- Failsafe: als de nieuwe laag een error gooit of leeg resultaat geeft → val terug op het bestaande pad. We mogen nooit een gebruikersinteractie laten falen door het experiment.

## Stap 2 · Rijke EngineTrace (privacy-veilig)

Uitbreiding van `EngineTrace` in `src/lib/assistant/types.ts`:

```text
EngineTrace {
  turn_id: string                    // ULID, voor cross-referentie met voice_intents
  total_ms: number
  slowest_engine: string

  conversation: { primary, actions_count, model, ms, ambiguous }
  memory:       { persona_signature, hits_count, sources[], ms }
  context:      { today_count, has_next_event, snapshot_keys[], ms }
  initiative:   { allow, reason, ms }
  suggestion:   { proposals_count, skills[], ms }
  decision:     { kept, rejected, rejection_reasons[], reason, ms }
  execution:    { status, intent, ms, used_fallback: boolean }
}
```

Privacy-regels (hard):
- **Geen** transcript-tekst, geen titels, geen datums, geen reply-tekst in de trace.
- Alleen tellingen, signatures, intent-namen, redenen (uit een vaste enum), en timings.
- Persona alleen via `signature` (al gehasht), nooit ruwe profielvelden.
- Memory-hits alleen als `{key, confidence}`, nooit `value`.

Implementatie:
- Kleine helper `withTiming(name, fn)` in `pipeline.ts` → meet ms per engine + bouw timings-map.
- Decision Engine geeft voortaan `Decision.rejections: { skill, reason }[]` terug (reason uit enum: `over_cap`, `duplicate`, `persona_quiet`, `requires_consent_outside_chat_only`, ...).
- Suggestion Engine vult `Proposal.rationale` met enum-waarden (al deels aanwezig).
- `runAssistantTurn` schrijft trace naar `voice_intents.payload.engine_trace` (jsonb-veld bestaat al, geen migratie nodig).

## Stap 3 · Debug-paneel (alleen voor tester)

- Nieuwe component `src/components/debug/engine-trace-panel.tsx`: collapsible panel onderaan de orb-pagina, met chronologisch timeline-overzicht per engine + ms-balkjes + reden-chips.
- Zichtbaarheid:
  - Lokaal toggle via `localStorage.setItem('hr_debug', '1')` (browser console-only, niet via UI — geen knop in de gebruikers-UI).
  - Server stuurt `engine_trace` alleen mee in de response als de flag actief is voor deze user; anders `undefined` (geen extra bytes voor gewone gebruikers).
- `PipelineResult` krijgt optioneel veld `engine_trace?: EngineTrace`.

## Stap 4 · Server-side meetbaarheid

- Trace wegschrijven naar `voice_intents.payload.engine_trace` voor élke turn (ook wanneer de oude pipeline draait, met `framework: "legacy"` + alleen totale ms). Zo kunnen we straks vergelijken: hoe vaak zou de nieuwe laag een ándere decision genomen hebben?
- Geen nieuwe tabel, geen migratie — `payload` is al jsonb.

## Wat we NIET doen in deze sprint

- Geen reminder/event/query/release-flows door de nieuwe laag (Sprint 3+).
- Geen schema-migratie (alles past in bestaande jsonb).
- Geen UI-flag voor gebruikers — debug is strict tester-only via localStorage.
- Geen vergelijkende A/B-runner (twee pipelines tegelijk draaien). Eerst kwaliteit per turn meten, dan pas A/B.

## Resultaat

Eén smalle live-flow door het framework, élke turn produceert een rijke trace die we ter plekke kunnen bekijken, en we hebben de meetbasis om Sprint 3 (volgende intent-verhuizing) op data te baseren.
