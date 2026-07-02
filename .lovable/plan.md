## Doel
Bewijzen dat de main assistant reply op iPhone (Safari én Chrome) wél afspeelt door tijdelijk de acknowledgement-audio op mobile/iOS over te slaan.

## Wijzigingen

### 1. Mobile/iOS detectie helper
Nieuwe util `src/lib/voice/is-mobile-audio.ts`:
- Detecteert iOS (iPhone/iPad/iPod, inclusief iPadOS die zich als Mac voordoet met touch) én alle mobile browsers via UA + `matchMedia('(pointer: coarse)')`.
- Exporteert `shouldSkipAckAudio()` die `true` teruggeeft op iOS én overige mobile devices.
- SSR-safe (returnt `false` zonder `window`).

### 2. Ack overslaan op mobile
In `src/lib/voice/voice-service.ts`:
- `playAcknowledgement()`: check `shouldSkipAckAudio()`. Zo ja: log `[ACK SKIP] mobile/iOS — main reply only`, return no-op stop-functie. Geen `speak()` call, geen fetch, geen audio element.
- `prewarmVoiceCache()`: op mobile ook overslaan (geen zin om ack-clips te warmen die we niet spelen).

### 3. Logging voor verificatie
Behoud bestaande `[MAIN TTS START]` / `[MAIN AUDIO PLAY]` / `[MAIN AUDIO END]` logs. Voeg `[ACK SKIP]` toe met reden (`ios` of `mobile`) zodat we in de console direct zien dat de ack-tak niet meer draait.

### 4. Niet aanraken
- Geen wijziging aan `VoiceOrb` — die blijft `playAcknowledgement()` aanroepen; de service bepaalt zelf of hij daadwerkelijk speelt.
- Geen wijziging aan de pipeline of main-reply logica.
- Desktop gedrag blijft ongewijzigd (ack blijft daar spelen).

## Testplan
1. Open app op iPhone (Safari en Chrome).
2. Tik orb, spreek opdracht in.
3. Verwacht in console: `[ACK SKIP] …` → `[MAIN TTS START]` → `[MAIN AUDIO PLAY]` → `[MAIN AUDIO END]`.
4. Verwacht hoorbaar: geen "Even kijken", wel volledige hoofdreply.

Als de hoofdreply nu wél speelt: bevestigd dat ack de blocker was → we kunnen later een mobile-veilige ack-strategie ontwerpen (bv. één gecombineerde audio-stream). Zo niet: probleem zit dieper in de main-reply audio zelf en gaan we daar verder debuggen.
