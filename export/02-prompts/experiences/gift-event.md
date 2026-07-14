# Gift-Event Experience — prompts

**Bestand:** `05-server-code/assistant/experiences/gift-event.ts`

Sociale gelegenheden voor iemand anders (kinderfeestje, verjaardag, bruiloft) worden door de Brain gemarkeerd met `experience="gift_event"` + `experience_data`. De framework-pipeline neemt dit over en doet twee dingen:

1. **Clarify-modus** — als kernvelden ontbreken, één natuurlijke vraag stellen, state opslaan in `voice_experience_state` (15 min).
2. **Results-modus** — drie cadeau-ideeën genereren + reminder-voorstel klaarzetten.

## Clarify-modus

Vragen komen uit `experiences/spoken-summary.ts::buildClarifyQuestion()`. Volgorde van missende velden: `who → event_type → iso_datetime → age → interests → budget`. Vragen zijn adaptief; na 2 clarify-rondes geeft de pipeline op en gaat door met beschikbare info.

## Results-modus — ideeën-generator prompt

Kleine LLM-call, max 3 zeer korte ideeën.

```text
Je geeft drie korte, concrete cadeau-ideeën in het Nederlands.
Regels:
- Max 6 woorden per idee.
- Geen merknamen, geen prijzen, geen uitleg.
- Pas IDEEN aan op de gegeven leeftijd en interesses (cruciaal).
- Toon: ${toneHint}.
- Antwoord ALLEEN als JSON array van 3 strings, niets anders.
```

**User-message:**
```text
Voor wie: ${input.who ?? "kind"}
Gelegenheid: ${input.event_type ?? "kinderfeestje"}
Leeftijd: ${ageHint}
Interesses: ${interestsHint}
Budget: ${budgetHint}
```

## Default lead-time

`DEFAULT_LEAD_DAYS = 3` — reminder om "cadeautje kopen" wordt automatisch 3 dagen vóór de event-datum op 09:00 Europe/Amsterdam gezet (`gift-event.ts:71`).

## Continuation

Na een clarify-vraag houdt `voice_experience_state` de tot dan toe verzamelde `GiftEventInput` en `askedField` vast. `assistant/experiences/continuation.ts::looksLikeContinuation()` herkent korte aanvullingen ("het is een meisje van acht") zonder Brain-call en merged ze in.
