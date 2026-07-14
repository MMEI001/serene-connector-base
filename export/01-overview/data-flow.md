# Data-flow per turn

```text
[user spreekt]
   │
   ▼
transcribe.functions.ts  ──►  openai/whisper OR google/gemini STT
   │  (persisteert voice_transcriptions rij)
   ▼
runVoicePipeline({ text, transcription_id, history[-6] })
   │
   │  0. loadUserPersona  → prompt_fragment + hints
   │
   ▼
detectAgendaQuery?  ─►  ja: handleQuery() direct → geen LLM-call
   │  nee
   ▼
processVoiceInput(text, persona, {history, contextSummary})
   │
   │  optional reasoning (test-mode)
   │  hoofdcall  (google/gemini-3-flash-preview, 6s timeout)
   │  optional quality (test-mode)
   │
   ▼
primary.intent = ?
   │
   ├─ assistant_chat + needs_live_info=true
   │     └─►  webSearch(live_queries)  →  synthesizeWithWeb  →  reply + products[]
   │
   ├─ assistant_chat  (evt. suggested_actions)
   │     └─►  runAssistantTurn (framework)
   │            └─►  Memory→Context→Conv→Exp→Init→Sug→Decision→Execution
   │            └─►  memory-writeback (bevestiging vragen indien kandidaat)
   │            └─►  needs_confirmation? → voice_actions insert + preview
   │
   └─ reminder / event / note / release / query
         └─►  dispatchVoiceBundle → handlers/*.ts → DB insert
   │
   ▼
PipelineResult { intent, status, confirmation, assistant_reply?,
                  products?, experience_card?, engine_trace? }
   │
   ▼
[client] voice-orb.tsx toont reply, speelt TTS via /functions/v1/text-to-speech,
         toont productkaarten of bevestigingskaart met "Bevestigen / Annuleren".
   │  bij bevestiging:
   ▼
confirmVoiceAction(action_id, overrides?) → commitVoiceBundle → DB
```

## Latency-budget (voice-mode)

- STT: 0.6 – 1.2 s
- Persona load: <10 ms
- Brain hoofdcall: **harde cap 6 s** (fallback-reply na timeout)
- Web-tak (indien): +2 – 5 s
- Framework-turn (indien): +200 – 800 ms
- TTS start: <500 ms (ElevenLabs Flash v2.5 streaming)
