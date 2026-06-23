## Doel

Instrumenteer de volledige TTS-flow in `src/lib/speak.ts` en zorg dat de gebruiker vrijwel altijd audio hoort, met automatische retry + browser-TTS fallback bij stilte.

## Diagnose

Console toont herhaaldelijk:
- `NotAllowedError` ("user agent or platform … denied permission") na een succesvolle 200 van de edge function
- `AbortError` na een nieuwe TTS-call die de vorige onderbreekt

Hoofdoorzaak: `audio.play()` wordt aangeroepen ná meerdere `await`s (`loadPrefs` → `getSession` → `fetch` → `res.blob()`), dus de browser ziet geen user-gesture meer en blokkeert autoplay. Tweede oorzaak: de vorige `currentAudio` wordt gepauzeerd zonder de bijbehorende `play()`-promise op te vangen → `AbortError`.

## Wijzigingen — alleen `src/lib/speak.ts`

### 1. Instrumentatie

Nieuwe helper `logTts(event, details?)` die `console.log` doet met vast prefix `[TTS]` en `event`-naam, plus stabiele velden (`intent?`, `provider`, `voice_id`, `voice_enabled`, timings).

`speakText` krijgt optionele `intent`-param:
```ts
speakText(text, opts?: { force?, voiceId?, intent? })
```

Te loggen events (in volgorde):
- `speakText_called` — `{ intent, length, force }`
- `prefs_loaded` — `{ voice_enabled, voice_provider, voice_id }`
- `skipped_disabled` — wanneer voice uit staat
- `cooldown_active` — als ElevenLabs-cooldown actief is
- `tts_request_started` — `{ intent, voice_provider, voice_id, t0 }`
- `tts_request_completed` — `{ intent, status, ok, contentType, duration_ms }`
- `tts_request_failed` — `{ intent, status, error }`
- `audio_play_started` — `{ intent, ttfa_ms }` *(ttfa = time-to-first-audio = play-start − speakText-called)*
- `audio_play_success` — `{ intent, ttfa_ms }` *(emit op `playing` event)*
- `audio_play_ended` — `{ intent, duration_ms }`
- `audio_play_failed` — `{ intent, reason, error }`
- `retry_attempt` — `{ intent, attempt }`
- `fallback_browser` — `{ intent, reason }`

Bestaande losse `console.log("[TTS] …")` regels vervangen door deze events (semantisch hetzelfde, gestructureerder).

### 2. Retry + fallback

Wrap audio-playback in `playWithRetry(blob, intent, t0)`:

1. Maak `Audio` aan, attach listeners (`playing`, `ended`, `error`).
2. Roep `audio.play()` aan. Start een 2000 ms timeout.
3. Als `playing`-event vóór de timeout vuurt → log `audio_play_started` + clear timeout. Klaar.
4. Als `play()`-promise rejected **of** timeout vuurt zonder `playing`:
   - Eerste keer → `retry_attempt {attempt:1}`, maak nieuw `Audio`-object van dezelfde blob-URL, probeer opnieuw met dezelfde 2 s window.
   - Tweede mislukking → `fallback_browser {reason:"playback_timeout"|"not_allowed"|err.name}` en roep `browserSpeak(text, intent)` aan.

`browserSpeak` krijgt ook instrumentatie: `fallback_browser` + listen op `onstart`/`onend` voor `audio_play_started`/`audio_play_ended` met `provider:"browser"`.

### 3. AbortError voorkomen

Voor we de nieuwe audio starten:
- Als `currentAudio` bestaat: `currentAudio.onerror = null; currentAudio.pause(); URL.revokeObjectURL(currentAudio.src)`, en negeer de eventueel afgewezen vorige `play()`-promise (we vangen 'm al via een `.catch(() => {})` op het moment van play-aanroep).

### 4. Call-sites (voice-orb)

`speakText(...)` wordt op 3 plekken aangeroepen vanuit `voice-orb.tsx` (needs_confirmation, completed, query_intro). Voeg `intent` mee:
- needs_confirmation → `{ intent: "confirm" }` (of `"assistant_chat_confirm"` als `assistant_reply` aanwezig)
- completed → `{ intent: result.intent }` (bv. `"assistant_chat"`, `"query"`, `"reminder"`)

Geen verdere gedrags­veranderingen in voice-orb.

### 5. Niet in scope

- Edge function (`text-to-speech`) gedrag/wijzigingen
- Andere providers dan ElevenLabs / browser-fallback
- Wijzigingen aan de orb-state machine of UI
- Caching van audio-blobs (kan later)

## Verificatie

1. Spreek een testzin in. Verwacht in console (volgorde): `speakText_called` → `prefs_loaded` → `tts_request_started` → `tts_request_completed` (status 200) → `audio_play_started` → `audio_play_success` met `ttfa_ms`.
2. Forceer NotAllowed door autoplay-policy te triggeren: verwacht na timeout `retry_attempt {attempt:1}` → bij blijvende mislukking `fallback_browser` + hoorbare Nederlandse browser-TTS.
3. Snel twee voice-acties achter elkaar: geen unhandled `AbortError` meer; tweede afspeelactie start zonder error.
