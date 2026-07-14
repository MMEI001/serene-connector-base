# Code versus prompt versus aanname

Overzicht per gedragsregel. Zie de detaildocs in `03-behavior-rules/` voor letterlijke verwijzingen.

| Regel | Herkomst | Locatie |
| --- | --- | --- |
| 6 intent-typen bestaan (assistant_chat / reminder / event / note / query / checkin / release) | **code** | `voice/types.ts` enum + `voice/handlers/*` |
| 10 product-intents in Brain-output (conversation, advice, brainstorm, planning, calendar, reminder, shopping, todo, clarification, confirmation) | **code + prompt** | `voice/process-voice-input.ts:261` |
| Max 3 acties per turn | **code** | `voice/process-voice-input.ts:30` |
| Keyword-detectie voor agenda-query ("agenda", "planning", "wat staat er…") bypass Brain | **code** | `voice-pipeline.functions.ts:175 detectAgendaQuery` |
| `needs_live_info` alleen bij prijs/winkel/aanbieding/nieuws | **prompt** | `voice/process-voice-input.ts:346-349 + 424-429` |
| Memory-kandidaat max 1 per turn, threshold 0.35 | **code** | `assistant/memory/classifier.ts:150` + `memory-engine.ts:112` |
| Ja/nee-bevestiging voor memory geldig 5 min | **code** | `assistant/memory/store.ts:12 PENDING_TTL_MS` |
| Bevestigingskaart voor reminder/event 5 min geldig | **code** | `voice-pipeline.functions.ts:218 PENDING_TTL_MS` |
| Gift-event experience is enige "experience" | **code + prompt** | `voice/process-voice-input.ts:333` + `assistant/experiences/gift-event.ts` |
| Reminder default-tijd 09:00 Europe/Amsterdam | **code + prompt** | `voice-pipeline.functions.ts:100 amsterdamIso` + `voice/process-voice-input.ts:418` |
| "Zaterdag" → reminder één werkdag (vrijdag) ervoor | **code** | `voice-pipeline.functions.ts:73-93 deriveDefaultIso` |
| Multi-intent parsing: alles komt binnen als losse `suggested_actions[]` maar wordt **niet altijd uitgevoerd** — huidige code neemt vaak alleen primary | **code + FIX nodig** | zie `03-behavior-rules/multi-intent.md` |
| Ontbrekende datum → Brain moet zelf slimme default kiezen (huidig gedrag) i.p.v. vragen | **prompt: "Vul zelf slimme defaults — vraag niets terug"** (r. 419) | **⚠ FIX** in `03-behavior-rules/missing-datetime.md` |
| Locatievraag ("waar koop ik X") wordt nu behandeld als `needs_live_info` → losse product-cards, geen link naar reminder | **code** | `voice-pipeline.functions.ts:300-361` — **FIX** in `03-behavior-rules/location-and-shopping.md` |
| Initiative Engine mag ongevraagd voorstellen doen als Opportunity Score hoog is | **code** | `assistant/initiative-engine.ts` — **FIX** in `03-behavior-rules/proactive-suggestions.md` |
| Nederlandse toon, `nooit "de X uur"` | **aanname / niet expliciet geregeld** | zie `03-behavior-rules/dutch-language.md` |
| Titel afleiden uit reply/transcript (niet letterlijk overnemen) | **code partieel** | `voice-pipeline.functions.ts:109 deriveTitleFromReply` + `:123 deriveTitleFromTranscript` — Brain-prompt zegt ook "Titels kort en imperatief" (r. 419) |
