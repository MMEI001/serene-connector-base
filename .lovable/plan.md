## Diagnose

Answering the 5 questions against the current code:

1. **Structured output reply**: Only when `primary.intent === "assistant_chat"` does `voice-pipeline.functions.ts` extract `assistantReply` (fallback `"Ik denk met je mee."`). For direct intents (reminder / shopping / todo) `assistant_reply` is `null` and `result.confirmation` is used instead. So a valid "reply" is *not* guaranteed.
2. **Passed to speakAndAnimate?**: In `voice-orb.tsx › handleResult`, the `needs_confirmation` branch composes `spokenConfirm = advies + preview + "Wil je dit zo bevestigen?"` and calls `speakAndAnimate(spokenConfirm, …)`. If `spoken_summary` and `assistant_reply` are both empty, only the preview + generic question is spoken — no real explanation.
3. **Overwritten by confirmation build?**: Not overwritten, but `assistant_reply` is *replaced* by `assistantReply` only inside the assistant_chat branch. Non-chat intents lose the natural reply entirely.
4. **Confirmation flow skips TTS?**: `speakAndAnimate` is always called, but it forwards to `voice-service.speak()`, which returns silently on ElevenLabs errors. Recent console logs show `upstream_429_via_http_200` on prewarm — the same 429 can hit the main reply and playback then silently no-ops. The orb still shows "Spreekt" because `setIsSpeaking(true)` runs unconditionally.
5. **Log the exact text**: `[Orb 2]` logs `preview: text.slice(0,60)`. Truncation + no `[Orb 3] final reply` line makes it hard to verify the full sentence and its provenance (spoken_summary vs assistant_reply vs fallback).

## Plan

### 1. Guarantee a non-empty reply for every intent
- In `src/lib/voice/process-voice-input.ts`: require `reply` in structured output for *all* intents (not just conversational). Validate/fill from the model; if missing, synthesize a short natural sentence from intent + payload (e.g. shopping → "Ik heb alvast een boodschappenlijstje voor je klaargezet.").
- In `src/lib/voice-pipeline.functions.ts`: lift `assistantReply` extraction out of the `assistant_chat` branch so `result.assistant_reply` is populated for reminder / shopping / todo / event as well.

### 2. Single source of truth for spoken text
- In `voice-orb.tsx › handleResult`, compute one `spokenText` variable (spoken_summary → assistant_reply → preview-fallback) and use it for *both* branches (needs_confirmation and completed).
- Guarantee: the confirmation card and the TTS use exactly the same `assistant_reply` string.

### 3. Explicit, full logging of the spoken reply
Add before every `speakAndAnimate` call:
```
console.log("[Orb 1a] Assistant reply:", assistantReply);
console.log("[Orb 1b] Spoken text:", spokenText);
```
And in `voice-service.speak()`:
```
console.log("[Voice 3.0] Final text →", cleanText);
console.log("[Voice 4.body] ElevenLabs body", { text, voice_id });
console.log("[Voice 6a] audio.play()");
```
No truncation on these lines.

### 4. Fallback on ElevenLabs 429/5xx
In `voice-service.speak()`, when the edge function returns `upstream_429` or 5xx:
- Emit trace `source: "error"` (already done)
- If provider preference allows fallback, speak via browser `speechSynthesis` so the user always hears the explanation
- Return a rejected promise so `[Orb 2!]` surfaces it, and clear `isSpeaking`

### 5. Ensure card + speech render together
Move `setConfirming(...)` to run *before* `await speakAndAnimate` (already the case) and `void` the speak call so the card appears immediately while audio starts.

### Verification
After the change, one turn ("Zet een boodschappenlijstje klaar") must produce this console sequence:
```
[Orb 1a] Assistant reply: "Ik heb alvast een boodschappenlijstje voor je klaargezet. Zal ik die opslaan?"
[Orb 1b] Spoken text: <same>
[Orb 2] speakAndAnimate called …
[Voice 3.0] Final text → <same>
[Voice 4.body] ElevenLabs body …
[Voice 6a] audio.play()
```
And audio plays every turn, or falls back to browser TTS on 429.

## Files touched
- `src/lib/voice/process-voice-input.ts` — always require/synthesize `reply`
- `src/lib/voice-pipeline.functions.ts` — set `result.assistant_reply` for all intents
- `src/components/voice-orb.tsx` — single `spokenText`, explicit full logs
- `src/lib/voice/voice-service.ts` — final-text log, ElevenLabs body log, 429 → browser fallback
