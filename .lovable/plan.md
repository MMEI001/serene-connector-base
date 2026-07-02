## Doel
iPhone/mobile gebruikers krijgen altijd hoorbare feedback door de hoofdreply via browser `speechSynthesis` af te spelen. ElevenLabs blijft actief op desktop.

## Wijzigingen

### `src/lib/voice/voice-service.ts` — `speak()`
Direct na het laden van voice-prefs, vóór cache-check en fetch, een mobile-guard toevoegen:

```
const skipReason = shouldSkipAckAudio(); // hergebruikt iOS/mobile detectie
if (skipReason && !options.preloadOnly && !options.isAck) {
  console.log("%c[iOS FALLBACK]", "color:#3b82f6;font-weight:bold",
              `using speechSynthesis (${skipReason})`);
  const latency = Math.round(performance.now() - t0);
  browserSpeakFallback(cleanText, intent, route, latency);
  options.onStart?.();
  // browserSpeakFallback is fire-and-forget; onEnd wordt via utterance.onend afgevuurd
  return;
}
```

`browserSpeakFallback` uitbreiden zodat het `options.onStart` / `options.onEnd` correct koppelt aan `utterance.onstart` / `utterance.onend` (nu ontbreekt dat). Dit zorgt dat de orb-state (Spreekt → Luistert) correct terugvalt en de continuous-mode werkt.

Ack-branch (`options.isAck`) blijft ongewijzigd — die wordt op mobile al geskipt via de bestaande `playAcknowledgement` guard.

### Naming
Detectie-helper hernoemen we niet; `shouldSkipAckAudio` dekt nu twee use-cases. We voegen alleen een korte JSDoc-noot toe dat de helper ook de "iOS TTS fallback" trigger is.

### Niet aanraken
- Geen wijzigingen in `voice-orb.tsx`, pipeline, of edge function.
- Desktop-gedrag blijft 100% ongewijzigd (ElevenLabs + ack).
- Trace-logging (`emitTrace` met `provider: browser`) blijft werken via `browserSpeakFallback`.

## Verificatie op iPhone
1. Tik orb, spreek opdracht.
2. Console: `[iOS FALLBACK] using speechSynthesis (ios)` gevolgd door hoorbare browser-stem.
3. Orb keert na uitspreken terug naar luister-state (dankzij `onEnd` hook).
4. Desktop test: geen `[iOS FALLBACK]` log, ElevenLabs speelt normaal.
