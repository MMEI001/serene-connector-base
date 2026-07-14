# Ontbrekende datum en tijd

## Wat er nu gebeurt `[prompt + code]`

De huidige system-prompt zegt letterlijk (`voice/process-voice-input.ts:419`):

> "Titels kort en imperatief. Vul zelf slimme defaults — vraag niets terug."

En in de legacy-pipeline (`voice-pipeline.functions.ts:64` `deriveDefaultIso`) worden datums heuristisch afgeleid uit het transcript ("zaterdag" → volgende zaterdag; niets → morgen 09:00). De prompt zegt ook: "Reminder zonder tijd → 09:00 Europe/Amsterdam op een logische dag."

**Resultaat:** de assistent verzint een datum als er geen is. Dat is precies wat jij NIET wilt.

## De gewenste werking `[FIX-spec]`

| Situatie | Nieuw gedrag |
| --- | --- |
| Geen datum, geen tijd | **Vraag alleen naar de datum.** Bewaar context. |
| Datum bekend, geen tijd | **Vraag alleen naar de tijd** (en alleen als de gebruiker impliciet zei dat er een tijd hoort — bv. "afspraak", "vergadering", "tandarts"). |
| Datum en tijd bekend | Direct bevestiging vragen — nooit stil opslaan. |
| Vage aanduiding ("volgende week") | Vraag om verduidelijking: welke dag? |

**Nooit** meer zelf een dag of tijd verzinnen voor `event` / `reminder`. Voor `note` blijft datum sowieso optioneel.

## Aan te passen

### 1. System-prompt SUGGESTED_ACTIONS REGELS vervangen door:

```text
SUGGESTED_ACTIONS REGELS
- Alleen wanneer stap 3 hierboven eerlijk "ja" is. Meestal 1 actie, soms 2 (zie multi-intent).
- iso_datetime altijd volledig ISO 8601 met offset ("2026-06-27T09:00:00+02:00") — maar ALLEEN als de gebruiker een concrete datum noemde.
- Bij ontbrekende datum voor een event of reminder: MAAK GEEN suggested_action. Vraag in `reply` één korte vraag: "Wanneer moet ik dat inplannen?" en zet `ambiguous=true` + `clarification_question` met dezelfde vraag. Verzin NOOIT zelf een datum.
- Bij bekende datum maar ontbrekende tijd voor een afspraak: MAAK de suggested_action wél, maar laat `start_time` leeg. Zet in `reply` één korte tijdvraag: "Hoe laat moet ik het zetten?".
- Voor reminders zonder tijd is 09:00 Europe/Amsterdam wél toegestaan (dat is een gedeelde default die de gebruiker verwacht).
- Titels kort en imperatief. Vraag NOOIT terug voor iets anders dan een ontbrekende datum of tijd.
```

### 2. Nieuw `voice_experience_state.kind = "pending_datetime"`

Bewaar context zodat een vervolg-zin ("dat wordt morgen 10 uur") aan de eerdere intent kan worden geplakt.

```sql
-- migratie 9998_pending_datetime_state.sql
-- voice_experience_state.kind is al TEXT — geen schema-wijziging, alleen convention.
```

Structuur (in payload):

```json
{
  "kind": "pending_datetime",
  "data": {
    "intent": "event",
    "title": "Bezoek Ria en Piet",
    "asks": "date"  // "date" | "time"
  },
  "expires_at": "<+15 min>"
}
```

### 3. Continuation-handler in `conversation-engine.ts::understand()`

Voeg toe: als `state.kind === "pending_datetime"` en de nieuwe zin bevat een datum-token → merge en genereer suggested_action inclusief bevestigingskaart. Vergelijkbaar met bestaande `looksLikeContinuation` voor gift_event.

### 4. Legacy-pad uitschakelen bij `intent === event | reminder`

In `voice-pipeline.functions.ts` het pad dat `deriveDefaultIso()` gebruikt voor events/reminders zonder datum → skip en laat framework de clarify-vraag stellen.

## Randgevallen

- **"Bel morgen"** → datum=morgen, geen tijd, intent=reminder → OK, gebruik 09:00 default. Vraag NIET om tijd; reminder mag stil defaulten.
- **"Bel morgen om 3 uur"** → datum=morgen 15:00 → direct bevestiging.
- **"Tandarts inplannen"** → geen datum, geen tijd → vraag: "Wanneer wil je de tandarts inplannen?".
- **"Volgende week"** → dubbelzinnig → vraag: "Welke dag volgende week?".
