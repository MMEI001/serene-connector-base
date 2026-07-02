## Doel
`browserSpeakFallback` gebruikt op iOS/mobile automatisch de beste beschikbare vrouwelijke Nederlandse stem in plaats van de systeem-default.

## Wijzigingen — alleen in `src/lib/voice/voice-service.ts`

### 1. Voice selector helper
Nieuwe functie `pickPreferredVoice(): SpeechSynthesisVoice | null` die `speechSynthesis.getVoices()` doorloopt en scoort. Prioriteit (hoog → laag):

1. `nl-NL` / `nl-BE` + vrouwelijk (naam matcht Ellen, Xander uitsluiten, prefer Claire, Ellen, Fenna, Lotte, Saskia, of `name`-heuristiek "female"/vrouwelijke namen). Bonus als naam bevat "Siri".
2. Elke `nl-*` stem (ongeacht geslacht).
3. `en-*` + vrouwelijk (Samantha, Karen, Moira, Serena, Susan, "female").
4. `null` → laat browser default.

Vrouwelijk-detectie via een kleine known-female-names lijst (Samantha, Karen, Moira, Serena, Susan, Victoria, Tessa, Fiona, Allison, Ava, Zoe, Ellen, Claire, Fenna, Lotte, Saskia, Xander uitsluiten, Daniel/Alex/Fred uitsluiten) plus check op substring "female".

### 2. Async voices ready
iOS Safari geeft bij eerste `getVoices()` vaak een lege lijst. Helper `ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]>`:
- Als `getVoices()` >0 → direct.
- Anders `voiceschanged` event afwachten met 500 ms timeout, dan opnieuw `getVoices()`.

### 3. `browserSpeakFallback` async-vriendelijk maken
- Sync: `SpeechSynthesisUtterance` blijft SYNCHROON aangemaakt (behoud iOS gesture-context).
- Direct daarna `ensureVoicesLoaded().then(voices => { utter.voice = pickPreferredVoice(voices) ?? null; console.log("Selected iOS Voice:", { name, lang }); })` en dan `speak(utter)` aanroepen ná voice-toewijzing. Op iOS is deze micro-vertraging aanvaardbaar; de utterance is al in de gesture-context aangemaakt dus `.speak()` blijft toegestaan.
- Als voices al beschikbaar zijn (desktop pad wordt hier niet geraakt), synchroon direct spelen.

### 4. Cache
Module-level `cachedPreferredVoice: SpeechSynthesisVoice | null` — na eerste selectie hergebruiken zodat volgende turns geen extra log/scan doen. Alleen bij eerste keer loggen:
```
console.log("%c[Selected iOS Voice]", "color:#3b82f6;font-weight:bold",
            { name: voice.name, lang: voice.lang });
```
Als geen voice gekozen kan worden: log `Selected iOS Voice: system default`.

## Niet aanraken
- Desktop ElevenLabs-pad ongewijzigd.
- Geen wijzigingen buiten `voice-service.ts`.
- Ack-skip logic blijft zoals hij is.

## Verificatie op iPhone
1. Eerste turn: console toont `[Selected iOS Voice] { name: "...", lang: "nl-NL" }`.
2. Hoorbaar verschil met vorige systeem-default (natuurlijker/vrouwelijk NL).
3. Volgende turns: geen nieuwe voice-selectie log (cached).
4. Bij ontbreken NL-stem: fallback naar EN-vrouwelijk, log toont juiste taalcode.
