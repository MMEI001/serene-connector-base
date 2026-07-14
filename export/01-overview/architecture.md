# Architectuur — HoofdRust Assistent

## Vier lagen

```text
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (browser)                                           │
│  voice-orb.tsx → mic → transcribe.functions.ts (STT)        │
│                → runVoicePipeline (server fn)               │
│                ← reply + suggested_actions/products         │
│                → confirmVoiceAction / cancelVoiceAction     │
└─────────────────────────────────────────────────────────────┘
                          │  RPC (TanStack server functions)
┌─────────────────────────────────────────────────────────────┐
│  SERVER — voice-pipeline.functions.ts (orchestrator)        │
│    1. loadUserPersona          (user_profiles)              │
│    2. processVoiceInput        (Brain — Gemini via LLGW)    │
│       ├─ optional REASONING_PROMPT (test mode)              │
│       ├─ hoofdcall met TOOL "respond"                       │
│       └─ optional QUALITY_PROMPT (test mode)                │
│    3. needs_live_info? → webSearch + synthesizeWithWeb      │
│    4. runAssistantTurn (framework) OR legacy dispatch       │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────────┐
│  ASSISTANT FRAMEWORK — assistant/pipeline.ts                │
│  Zeven engines in vaste volgorde:                           │
│    Memory → Context → Conversation → Experience →           │
│    Initiative → Suggestion → Decision → Execution           │
│  Alles produceert een privacy-veilige EngineTrace.          │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────────┐
│  DATA — Supabase (RLS scoped op auth.uid())                 │
│  ai_suggestions, appointments, reminders, notes,            │
│  let_go_items, assistant_memory, voice_actions,             │
│  voice_intents, voice_transcriptions, voice_errors,         │
│  voice_experience_state, user_profiles, calendar_*,         │
│  ics_calendars, ics_events, user_behavior_events, profiles  │
└─────────────────────────────────────────────────────────────┘
```

## Rol per laag

- **Brain** (`voice/process-voice-input.ts`): één LLM-call met tool-choice `respond`. Levert altijd een `reply` + eventueel `suggested_actions` (max 3). Beslist `needs_confirmation`, `needs_live_info`, `experience`.
- **Web-tak** (`tools/web-search.server.ts` + `tools/web-synth.server.ts`): alleen actief bij `needs_live_info=true`. Firecrawl-search → tweede LLM-call synthetiseert antwoord + normalized product-cards.
- **Assistant Framework** (`assistant/*`): rijkere engine-keten voor `assistant_chat`-turns. Beslist proactief gedrag, gift-event experience, memory write-back.
- **Legacy pipeline**: pad voor directe intents (reminder/event/note) die geen framework nodig hebben. `deriveDefaultIso`, `deriveTitleFromTranscript`, e.d. voor snelle defaults zonder tweede LLM-call.
- **Confirmation**: `voice_actions` rij met `status=needs_confirmation` + `expires_at` (5 min TTL). UI toont bevestigingskaart → `confirmVoiceAction` commit via `commitVoiceBundle`.

## Sleutel-file map

| Rol | File |
| --- | --- |
| Brain-prompt + LLM-call | `05-server-code/voice/process-voice-input.ts` |
| Persona → prompt fragment | `05-server-code/voice/persona.ts` + `load-persona.ts` |
| Orchestrator (RPC entry) | `05-server-code/functions/voice-pipeline.functions.ts` |
| Bevestig / annuleer | `05-server-code/functions/voice-confirm.functions.ts` |
| Framework-orchestrator | `05-server-code/assistant/pipeline.ts` |
| Memory extract + confirm | `05-server-code/assistant/memory/classifier.ts` + `memory-engine.ts` |
| Context-snapshot | `05-server-code/assistant/context-engine.ts` + `context-summary.ts` |
| Actie-uitvoerders | `05-server-code/voice/handlers/*.ts` |
| Web-tools | `05-server-code/tools/web-search.server.ts` + `web-synth.server.ts` |
| TTS (Deno Edge) | `04-supabase/edge-functions/text-to-speech/index.ts` |
