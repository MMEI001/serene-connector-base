# Agenda-overzicht

## Wat er nu gebeurt `[code]`

**Bestand:** `05-server-code/voice/handlers/query.ts`

Bij een agenda-vraag draait `handleQuery(scope)` waar scope = `today | tomorrow | this_week | next_week | specific_date`. Dit leest:

- `public.appointments` (eigen afspraken)
- `public.reminders` (openstaande reminders in scope)
- `public.ai_suggestions` (voorgestelde, nog niet-geaccepteerde items)

**Wat er nu NIET wordt meegenomen:** `public.ics_events` (geïmporteerde .ics-agenda's). Dat is een bron van "waarom mist er iets".

## De gewenste werking `[FIX-spec]`

Regel: het agenda-overzicht moet **alle bronnen** samenvoegen en per dag chronologisch gesorteerd tonen. Dedupliceren op titel + tijd (om dubbele Google/ICS-imports te vermijden).

## Aan te passen

### 1. `query.ts` uitbreiden

```typescript
// Voeg naast appointments/reminders ook ics_events toe:
const { data: icsRows } = await supabase
  .from("ics_events")
  .select("id, title, start_at, end_at, calendar_id")
  .gte("start_at", rangeStart)
  .lte("start_at", rangeEnd)
  .order("start_at", { ascending: true });

// Merge alle bronnen tot één AgendaEntry[]:
type AgendaEntry = {
  source: "appointment" | "reminder" | "ics" | "suggestion";
  id: string;
  title: string;
  when: Date;       // datum + tijd (of 09:00 default voor date-only)
  displayTime: string; // formatDutchTime()
};

// Dedupe: zelfde titel + zelfde uur binnen 5 min → houd 1 rij (voorkeur appointment > ics > reminder).
```

### 2. Datum-format

Gebruik `formatSpokenDateTime()` uit `03-behavior-rules/dutch-language.md`. In tekst:

```
Vandaag heb je:
- 9 uur, tandarts
- half 11, telefoontje met Ria
- 3 uur, ophalen kinderen

Vrijdag 25 juli:
- kwart over 10, boodschappen
- 2 uur, borrel
```

### 3. Lege agenda

```
Voor vandaag staat er niets in je agenda — een rustige dag dus.
```

### 4. Grote overzichten (>10 items)

Bij `this_week` / `next_week` met veel items: groepeer per dag, spreek alleen de eerste 3 hardop uit, verwijs voor de rest naar de UI-lijst:

```
Deze week heb je 14 dingen staan. De highlights: maandag om 10 uur tandarts,
woensdag om 2 uur werk-review, en zaterdag borrel bij Ria. De volledige lijst
zie je op je scherm.
```

### 5. Voorbereiding voor prompt-consumptie

`context-summary.ts` maakt al een compact blok "HUIDIGE CONTEXT" voor de Brain-prompt. Zorg dat dit blok:

- Alleen "vandaag + morgen + eerstvolgende belangrijke afspraak" bevat (niet de hele week — dat maakt de prompt te groot).
- Tijden al Nederlands-geformatteerd (zie `dutch-language.md`).
- Bij >5 items alleen totalen ("Je hebt vandaag 6 dingen staan, waarvan 2 vóór 10 uur.").

## Verificatie

Test-scenario dat moet slagen na de fix:

```
Gebruiker: "Wat staat er zaterdag op mijn agenda?"
Antwoord: "Zaterdag 26 juli heb je: 9 uur ontbijt met Piet, 2 uur borrel bij Ria (uit je Google-agenda), en een reminder 'bloemen kopen' 's ochtends om 9 uur."
```

De ICS-source moet natuurlijk in de reply zitten ("uit je Google-agenda") zodat de gebruiker weet waar het vandaan komt.
