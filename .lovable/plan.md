## Doel

Wanneer Assistant Mode advies geeft én daaruit een reminder (of event) ontstaat, sla de concrete suggesties als korte subtekst op naast de actie. De titel blijft kort; de suggesties zijn context.

Voorbeeld:
- Titel: `Cadeau kopen`
- Subtekst (klein/grijs): `Suggesties: knutselset, boekje of iets om samen te doen.`

## Wijzigingen

### 1. `src/lib/voice-pipeline.functions.ts` — suggesties extraheren

Nieuwe helper `extractSuggestionsFromReply(reply: string): string | null`:
- Zoekt naar lijstpatronen in `assistant_reply`:
  - `denken aan X, Y of Z`
  - `bijvoorbeeld X, Y of Z`
  - `zoals X, Y of Z`
  - `aan X, Y of Z` (na werkwoord "denken/voorstellen/overwegen")
- Resultaat: `"Suggesties: knutselset, boekje of iets om samen te doen."` (max 2 regels, max ~140 tekens, anders afkappen op woordgrens met `…`).
- Geen match of geen `assistant_chat` → `null`.

In de bestaande `assistant_chat`-tak, **na** het normaliseren van `suggested_actions`:
- Bereken `subtext = extractSuggestionsFromReply(assistantReply)` één keer.
- Voor elke `reminder`-actie: `payload.description = subtext` (alleen als geen `description` al gezet door GPT, en alleen als `subtext` niet-leeg).
- Voor elke `event`-actie: `payload.notes = subtext` (idem voorwaardelijk). *(Event-handler gebruikt dit veld nog niet voor opslag; deze stap blijft compatibel — zie sectie 4.)*

### 2. `src/lib/voice/handlers/reminder.ts` — subtekst in preview

`previewReminder`:
- Lees `description` uit payload (string, getrimd).
- Als aanwezig: voeg toe aan `preview` als tweede regel, voorafgegaan door newline. `commitVoiceBundle`/UI splitten al op `\n` voor preview-lijst.
  - `preview = "${when} — ${title}\n${description}"` (description al inclusief "Suggesties: …" prefix).
- `confirmation` (TTS) blijft kort en ongewijzigd — geen suggesties hardop herhalen (de `assistant_reply` heeft ze al uitgesproken).

`commitReminder` ongewijzigd: schrijft `description` al weg naar kolom `reminders.description`.

### 3. `src/components/voice-orb.tsx` — subtiele rendering

De preview-bubble (regel 461-465) toont nu `whitespace-pre-line`. Splits in twee delen:
- Eerste regel → normale tekst.
- Overige regel(s) → kleinere, gedimde tekst (`text-xs text-muted-foreground/80 mt-1`).
- Maximaal 2 regels subtekst (`line-clamp-2`).

Logica: `const [head, ...rest] = confirming.preview.split("\n"); const sub = rest.join(" ").trim();`.

### 4. Niet in scope (expliciet)

- Event-handler aanpassen om `notes` op te slaan: het event-schema gebruikt nu geen `notes`-kolom voor deze flow; volgt later als de gebruiker dat ook bij agenda-items wil.
- Wijzigingen aan de bewerken-flow: subtekst is niet bewerkbaar in deze ronde (kan later via apart veld).
- GPT-prompt aanpassen: we leiden suggesties af uit bestaande `assistant_reply`, geen extra modelcall.

## Verificatie

Test: *"Mijn dochter heeft volgende week een partijtje, ik zoek nog een cadeautje. Het kindje is 8 jaar."*
- Preview toont: `vrijdag 09:00 — Cadeau kopen` + subtiele tweede regel `Suggesties: knutselset, boekje of iets om samen te doen.`
- Na bevestigen: `reminders.title = "Cadeau kopen"`, `reminders.description = "Suggesties: …"`, `reminders.remind_at` = vrijdag 09:00 (default voor "volgende week").
- TTS spreekt alleen de assistant-reply + "Wil je dit zo bevestigen?" — geen dubbele opsomming.
