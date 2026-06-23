# Diagnose Assistant Mode-fout

## Wat ik vond in de logs

**Testzin** "Ik heb zaterdag een verjaardag, zal ik bloemen kopen?" — meerdere keren getest om 11:31, 11:32, 11:34, 11:35.

**Classifier:** werkt correct.
- `voice_intents.intent = assistant_chat`
- `reply` bv. *"Bloemen zijn altijd een goed idee voor een verjaardag. Zal ik een herinnering voor je instellen om ze morgenochtend te halen?"*
- `ambiguous = false`, geen `clarification_question` — precies zoals gewenst.

**Enum-migratie:** OK. `enum_range(voice_intent)` bevat `assistant_chat` in de live DB.

**Echte fout:** in `voice_actions`:
```
intent: assistant_chat
status: failed
error:  missing_fields
confirmation_text: "Ik miste de tijd of het onderwerp."
```

## Oorzaak

Het model stopt suggesties als reminder in `suggested_actions`, maar geeft natuurlijke taal mee ("morgenochtend", "vrijdag 09:00") in plaats van een ISO 8601 datetime. De pipeline doet:

```
if (suggested.length > 0) actions = suggested
→ dispatchVoiceBundle → previewReminder
→ payload.iso_datetime ontbreekt → status: "failed", error: "missing_fields"
```

Daarna kent de pipeline `assistant_reply` alleen toe aan `result.confirmation` voor `needs_confirmation` of `completed`. Bij `failed` blijft de generieke errortekst staan → orb spreekt/toont "Het lukte even niet…".

Dus: classifier OK, dispatcher OK voor assistant_chat zélf, TTS/orb-pad OK — het breekt op de **suggested reminder zonder ISO**.

## Fix

Twee complementaire wijzigingen, beide in `src/lib/voice-pipeline.functions.ts` en `src/lib/voice/process-voice-input.ts`:

1. **Server-side default voor suggested_actions zonder iso_datetime** (pipeline):
   - Bij normalisatie van `suggested_actions`: als `intent=reminder` en `iso_datetime` ontbreekt/ongeldig → bereken default op basis van context:
     - Probeer eerst een datum uit de oorspronkelijke transcript te halen (regex naar "zaterdag/zondag/…/morgen/overmorgen") en kies de werkdag ervóór, 09:00 Europe/Amsterdam.
     - Anders: morgen 09:00 Europe/Amsterdam.
   - Idem voor `intent=event` zonder `date`: gebruik dezelfde gevonden datum, default 09:00.
   - Als titel ontbreekt → afleiden uit `reply` of fallback "Herinnering".

2. **Failsafe in pipeline**: als na normalisatie/defaults de suggested actions tóch failen in `dispatchVoiceBundle`, val terug op alleen het assistant_chat-antwoord:
   - `actions = [primary]` (assistant_chat)
   - Dispatch opnieuw → `status: completed`, `confirmation = assistant_reply`
   - Log dit als `voice_actions.status = completed` met `intent: assistant_chat`, zodat de gebruiker minimaal het gesproken advies hoort i.p.v. de generieke fout.

3. **Prompt-aanscherping** (`process-voice-input.ts`): expliciet maken dat `suggested_actions[*].payload.iso_datetime` ALTIJD een volledige ISO 8601 string met Europe/Amsterdam-offset moet zijn — geen natuurlijke taal — en een voorbeeld toevoegen voor de zaterdag-bloemen-case. Dit voorkomt dat de fix-flow vaak nodig is.

## Niet aanraken

- Enum-migratie (al doorgevoerd).
- Classifier-keuze voor `assistant_chat` (werkt al correct, geen clarification meer).
- TTS/orb-pad voor `completed`/`needs_confirmation` (werkt al, alleen `failed` werd verkeerd verwoord).

## Verificatie na implementatie

- Run testzin opnieuw. Verwacht: `voice_intents.intent = assistant_chat`, en `voice_actions` één rij met `status = needs_confirmation` (preview "vrijdag 09:00 — Bloemen kopen") **of** `completed` met `intent=assistant_chat` (alleen advies). Geen `missing_fields`.
- Orb spreekt het advies + (indien preview) "Wil je dit zo bevestigen?".
