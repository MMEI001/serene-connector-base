## Doel
HoofdRust laten redeneren vanuit menselijke behoefte, niet vanuit intents/acties. Acties (reminder, agenda, boodschappenlijst) worden een bijproduct van "hoe help ik deze persoon", nooit het startpunt.

## Waar de wijziging landt
Alles gebeurt in de Brain-laag — geen wijzigingen aan handlers, DB, UI of suggestion-schema. Concreet: `src/lib/voice/process-voice-input.ts` (systemPrompt + reasoning-prompt).

## Aanpassingen

### 1. Reasoning Brain herformuleren (`REASONING_PROMPT`)
Vervang de huidige 10-vragenlijst door de 7-stappen-behoefte-analyse uit de opdracht, in exact deze volgorde:
1. Wat is de echte behoefte achter deze vraag?
2. Welke context weet ik al over deze persoon?
3. Wat zou een uitstekende persoonlijke assistent nu doen?
4. Hoe kan ik de mentale belasting verminderen?
5. Kan ik iets voorbereiden zodat de gebruiker minder hoeft na te denken?
6. Is een vervolgvraag nodig?
7. Pas nu: is een reminder / taak / agenda / boodschappenlijst nuttig — en zo ja welke?

Regel expliciet vastleggen: stap 7 mag nooit "ja" zijn als stap 1–5 dat niet ondersteunen. Acties zijn hulpmiddel, geen doel.

Reasoning blijft interne stap, ongewijzigde plek in de pipeline. In `mode: "voice"` blijft ze standaard uit (latency-budget), maar wordt automatisch aangezet voor `mode: "text"` en `mode: "test"`. Overweeg in een volgende iteratie voor voice-mode een "reasoning-lite" (1 zin, max 800ms) — dit staat als vervolg genoteerd, niet nu.

### 2. Hoofd-systemPrompt herschrijven (`systemPrompt`)
- KERNFILOSOFIE bovenaan herschrijven: "Denk nooit eerst in intents. Denk eerst: wat probeert deze persoon te bereiken? Dan: hoe help ik? Dan pas: is een actie nuttig?"
- Expliciet benoemen: HoofdRust gedraagt zich als een persoonlijke assistent die de gebruiker al jaren kent — niet als chatbot, agenda-app of opdracht-uitvoerder.
- INTENT-KEUZE-sectie verschuiven naar het einde onder een neutrale kop ("Hoe je je antwoord uiteindelijk labelt") en herformuleren als afgeleide van de behoefte, niet als startpunt.
- Actie-regels aanscherpen: bied maximaal één vervolgstap aan, en alleen wanneer stap 5/7 van de redenering dat rechtvaardigt. Bij twijfel: geen actie, wel een warm inhoudelijk antwoord.
- Twee canonieke VOORBEELDEN vervangen door de twee uit de opdracht (borrelhapjes zaterdag → eerst inspiratie, dán aanbod boodschappenlijst; "wat eten we vanavond" → concreet voorstel dat de beslissing wegneemt + aanbod lijstje).
- Reply-toon: warm, beslissend, ontlastend — nooit een vragende terugkaats-vraag als de gebruiker duidelijk om ontlasting vraagt.

### 3. Reply-lengte en voice-snelheid
Voice-mode blijft snel: 2–4 zinnen, één vervolgstap. Geen extra AI-calls, geen nieuwe modellen. De verandering zit puur in prompts.

### 4. Verificatie via `/test-mode`
Testset (bevestigen dat gedrag klopt):
- "Heb je leuke borrelhapjes voor zaterdag?" → inspiratie eerst, dan één aanbod voor boodschappenlijst.
- "Ik weet niet wat we vanavond moeten eten." → concreet voorstel dat de beslissing wegneemt + aanbod lijstje.
- "Ik voel me overprikkeld." → warme reply, géén actie.
- "Zet morgen 9 uur tandarts." → directe agenda-actie blijft werken (behoefte = agenda vastleggen).
- "Wat staat er morgen op mijn agenda?" → query-antwoord, geen actie voorgesteld.

## Buiten scope
- Geen wijzigingen aan `dispatch-voice-action`, handlers, suggestion-card UI, of DB-schema.
- Geen nieuw actie-type; boodschappenlijst blijft `note` met bullet-tekst.
- Geen model-upgrade; latency-profiel blijft gelijk.
