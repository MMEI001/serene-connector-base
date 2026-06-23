# Assistant Mode: dedupe preview + Bewerken/Annuleer/Bevestig

Twee verbeteringen op de assistant_chat-flow.

## 1. Duplicate preview-regels

**Oorzaak:** GPT geeft vaak 2-3 identieke `suggested_actions` terug. Onze server-side defaults vullen ze allemaal met dezelfde `iso_datetime` en dezelfde titel (afgeleid uit de hele `assistant_reply`), dus de preview krijgt 3× dezelfde regel.

**Fix in `src/lib/voice-pipeline.functions.ts`:**
- Nieuwe `deriveTitleFromTranscript(transcript)`: zoekt korte actie-frase met patroon `<zelfstandig nw> + (kopen|halen|bellen|sturen|regelen|brengen|maken|boeken|reserveren|plannen)`. Geen match → eerste werkwoord + object, max 4 woorden. Geen match → "Herinnering".
- Bij suggested_action defaults: titel afleiden uit het **transcript** (de vraag van de gebruiker), **niet** uit `assistant_reply`. Voorbeeld: *"Ik heb zaterdag een verjaardag, zal ik bloemen kopen?"* → titel `Bloemen kopen`, niet `Bloemen zijn een uitstekend idee voor`.
- Dedupe na normalisatie: `Map` op key `intent|iso_datetime|title.toLowerCase()`, neem eerste. Cap op max 2 acties.

## 2. Bewerken-knop

**Doel:** bij een voorstel: `Annuleer | Bewerken | Bevestig`. Bewerken opent een klein formulier waar titel + datum/tijd aangepast kunnen worden, daarna pas opslaan.

### Server (`src/lib/voice-confirm.functions.ts`)
Breid `confirmVoiceAction` uit met optionele `overrides`:
```ts
{ action_id: string; overrides?: { title?: string; iso_datetime?: string; date?: string; start_time?: string } }
```
Indien aanwezig: merge in de payload van de **eerste** confirmable action vóór `commitVoiceBundle`. Validatie:
- `title`: trim, min 1 char, max 200.
- `iso_datetime`: regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/`. Niet in verleden (> nu − 1 min).
- `date`: `/^\d{4}-\d{2}-\d{2}$/`. `start_time`: `/^\d{2}:\d{2}$/`.
Ongeldig → return `failed` met heldere melding (geen exception).

### Pipeline result uitbreiden
- `PipelineResult.editable?: { intent: "reminder" | "event"; title: string; iso_datetime?: string; date?: string; start_time?: string }` (alleen gevuld voor needs_confirmation met precies één confirmable action — de assistant_chat-case na dedupe).
- Pipeline vult deze in `voice-pipeline.functions.ts` voor het needs_confirmation-pad.

### Types (`src/lib/voice/types.ts`)
- `editable?` veld toevoegen aan `ActionResult` (optional, geen breaking change).

### UI (`src/components/voice-orb.tsx`)
- `Confirming` type krijgt optioneel `editable` veld (uit `result.editable`).
- Knoppenrij in `state === "confirming"`:
  - **Annuleer** (bestaand, links, secondary).
  - **Bewerken** (nieuw, midden, secondary, `Pencil` icoon).
  - **Bevestig** (bestaand, rechts, primary).
- Bewerken-paneel (nieuwe state `isEditing: boolean`, alleen tonen als `confirming.editable` aanwezig):
  - `<input type="text">` voor titel (prefill `editable.title`).
  - Voor `reminder`: `<input type="datetime-local">` (prefill `editable.iso_datetime` → naar local string).
  - Voor `event`: `<input type="date">` + `<input type="time">`.
  - Twee knoppen: **Terug** (sluit editor zonder wijzigingen) en **Opslaan & bevestig** (roept `confirmFn` met `overrides`).
  - Converteer `datetime-local` (lokale tijd in browser, NL-tz aanname) terug naar ISO met Amsterdam-offset via dezelfde helper als pipeline (gewoon `new Date(localStr).toISOString()` werkt niet voor DST-correctheid — gebruik een kleine inline helper die `+02:00`/`+01:00` plakt o.b.v. `Intl`).
- Geen TTS bij openen van editor (alleen UI-actie).
- `handleConfirm` accepteert nu een tweede arg `overrides?` en geeft die door.

### Geen wijzigingen aan
- `dispatch-voice-action.ts` (commit-pad blijft identiek).
- `getPendingVoiceAction` (revive-knop blijft simpele bevestiging — geen editor in revive-pad).
- Reminder/event handlers (`previewReminder` / `commitReminder` etc.) — geheel hergebruikt.
- TTS gedrag voor confirm-stap (advies blijft uitgesproken).

## Verificatie

Met test *"Ik heb zaterdag een verjaardag, zal ik bloemen kopen?"*:
- Preview toont **één** regel: `vrijdag 09:00 — Bloemen kopen`.
- Drie knoppen zichtbaar: Annuleer / Bewerken / Bevestig.
- Klikken op Bewerken: titel-veld bevat `Bloemen kopen`, datum/tijd-veld bevat vrijdag 09:00. Aanpassen + Opslaan slaat de reminder met aangepaste waarden op (controle via `voice_actions` row + nieuwe `reminders` row).
- Klikken op Annuleer: `voice_actions.status = failed`, error `cancelled`. Geen reminder aangemaakt.
- Klikken op Bevestig zonder bewerken: zoals nu — reminder met `Bloemen kopen` op vrijdag 09:00.
