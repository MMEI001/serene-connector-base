# Sprint 4 — Experience 001: Kinderfeestje

Eerste end-to-end "ervaring" die volledig door het Intelligence Framework loopt. Geen losse handler-logica, geen aparte route: één type vraag ("kinderfeestje volgende week") leidt tot een samenhangende reactie — begrijpen, contextcheck, advies, 3 cadeau-ideeën, voorstel voor herinnering, bewerken, bevestigen.

## Aanpak

We introduceren het concept **Experience** in het framework. Een Experience is een herkenbaar patroon dat in de Conversation/Initiative/Suggestion-engines wordt herkend en de bestaande engines extra inkleurt — geen parallelle pipeline.

### 1. Conversation Engine — uitbreiden
- Voeg in de Gemini system-prompt een paragraaf toe over "ervarings-patronen": als een gebruiker een sociale gebeurtenis voor een ander noemt (kinderfeestje, verjaardag, bruiloft, etentje) → classificeer als `assistant_chat` met `experience: "gift_event"` in payload. Extract entities: `who` (dochter/zoon/vriendin/…), `event_type` (kinderfeestje), `iso_datetime` (datum), optionele `age`, `interests`, `budget`.
- Aanvullen `tool` schema met optionele `experience` enum + `experience_data` object. Persona-prompt blijft.
- Reply moet warm-praktisch zijn ("Leuk! Dan is het handig om alvast een cadeautje te regelen.") — niet een directe vraag stellen.

### 2. Context Engine — uitbreiden
`snapshot()` krijgt een optionele `lookup` parameter. Voor een gift_event-turn vraagt de orchestrator extra:
- bestaat er al een appointment rond die datum met matchende titel-trefwoorden (kinderfeestje / verjaardag / feestje)?
- bestaat er al een reminder met "cadeau" + datum binnen 7 dagen vóór die datum?
Resultaat: `snapshot.experience = { existingAppointmentId?, existingReminderId?, leadDays }`.

### 3. Initiative Engine — uitbreiden
Voor `experience === "gift_event"`:
- Score start op 3 (advies + voorstel reminder).
- Reden `future_time_marker` + nieuwe reason `experience_gift_event` (privacy-veilig enum).
- Als reminder al bestaat → score = 1 (alleen bevestigen dat het al staat), reason `existing_followup_present`.
- Als event in het verleden ligt → score = 0.

### 4. Suggestion Engine — uitbreiden
Nieuwe helper `proposeGiftIdeas(ctx, conv)`:
- Tweede, korte Gemini-call (gemini-3-flash) met strikte JSON-output: 3 cadeau-ideeën op basis van `age`, `interests`, `budget` met sensible defaults wanneer onbekend (leeftijd 6–8, budget 15–20 €).
- Output wordt **geen** Proposal (geen DB-actie), maar `conv.experience.gift_ideas: string[]`.
- Daarnaast 1 reminder-proposal: titel `"Cadeautje kopen voor {who}"`, datum = event-datum minus `leadDays` (default 3) om 09:00, `related_appointment_id` indien gevonden, `description` = de 3 ideeën samengevat (1 regel per idee).

### 5. Decision Engine
Geen wijziging in logica; cap uit Sprint 3 staat de ene reminder-proposal toe (score ≥ 2). Voegt rejection-reason toe als reminder al bestaat (`duplicate`).

### 6. Execution Engine / Confirmation
- Reminder-proposal heeft `requiresConsent: true` → standaard `needs_confirmation`-pad via bestaande `voice_actions` + `commitVoiceBundle`. Bewerken-knop in `VoiceOrb` werkt al voor titel/datum/tijd.
- Voor `gift_ideas` voegt de orchestrator `result.experience_card = { kind: "gift_event", who, iso, ideas[] }` toe naast de bestaande confirmation. UI rendert dit boven de Bevestig/Annuleer-knoppen.

### 7. UI
- Nieuwe component `src/components/experience-card.tsx` — toont titel ("Cadeau voor {who}"), context-regel ("kinderfeestje {dag} {datum}"), 3 ideeën als bullets, en de subtekst "Reminder staat klaar — pas aan of bevestig hieronder".
- `VoiceOrb`: in `confirming`-state, als `result.experience_card` bestaat, render `ExperienceCard` boven het bestaande confirmation-blok.
- TTS-reply is kort: het advies + "Ik heb drie cadeau-ideeën en zet een reminder klaar — wil je die zo bevestigen?".

### 8. Types & trace
- `src/lib/assistant/types.ts`: voeg toe `ExperienceKind = "gift_event"`, `ExperiencePayload`, en in `Conversation.meta` veld `experience?`. Trace krijgt `experience?: { kind, had_existing_event, had_existing_reminder, ideas_count }` — geen ruwe tekst.
- `OpportunityReason` krijgt `experience_gift_event`, `existing_followup_present`.

## Bestanden

Nieuw:
- `src/components/experience-card.tsx`
- `src/lib/assistant/experiences/gift-event.ts` (idee-generator + context-lookup)

Aanpassen:
- `src/lib/voice/process-voice-input.ts` (tool-schema + system-prompt uitbreiden)
- `src/lib/assistant/context-engine.ts` (optionele experience-lookup)
- `src/lib/assistant/initiative-engine.ts` (gift_event-tak)
- `src/lib/assistant/suggestion-engine.ts` (gift-event-tak roept gift-event helper aan)
- `src/lib/assistant/pipeline.ts` (threading + experience-trace + result.experience_card)
- `src/lib/assistant/types.ts` (Experience-types + reasons + trace-veld)
- `src/lib/voice/types.ts` (ActionResult krijgt optioneel `experience_card`)
- `src/components/voice-orb.tsx` (render ExperienceCard in confirming-state)
- `src/lib/assistant/flags.ts` (zorg dat gift_event onder `chat_only` valt zodat hij door framework loopt)

## Veiligheid
- Geen automatische schrijfacties; reminder blijft altijd `needs_confirmation`.
- Gift-ideeën zijn tekst-only, niets in DB tot bevestiging.
- Trace bevat alleen tellingen/enums, geen namen of interesses.

## Test
Na build: zeg "Mijn dochter heeft volgende week vrijdag een kinderfeestje". Verwacht: warm advies + experience-kaart met 3 ideeën + bewerkbare reminder-bevestiging (3 dagen ervoor 09:00) + bevestigen schrijft naar `reminders`.
