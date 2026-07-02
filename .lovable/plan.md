# Voice latency: profile + optimize

Goal: first spoken word ≤ 2s, complete answer ≤ 5s. Latency > new features.

## 1. Profile the pipeline (measured, not guessed)

Add `perf.now()` timing stages into `voice-pipeline.functions.ts` and `voice-service.ts`, all emitted on one structured `[perf]` log line per turn:

| Stage | Where | Current estimate |
|---|---|---|
| `transcribe` | `transcribe.functions.ts` (Whisper) | 800–1500 ms |
| `context_assembly` | `memory-engine` + `context-engine` + `context-summary` | 200–600 ms |
| `prompt_build` | `systemPrompt()` construction | <5 ms |
| `llm_ttfb` | first byte of gateway response | 900–1800 ms |
| `llm_total` | full JSON received | 1500–3000 ms |
| `json_parse` | tool_call arguments parsing | <5 ms |
| `action_gen` | mapping to VoiceAction[] | <5 ms |
| `tts_ttfb` | first audio byte from ElevenLabs | 400–900 ms |
| `audio_play_start` | until `audio.play()` resolves | 100–400 ms |

Log shape:
```
[perf] turn=… t=1234 transcribe=980 ctx=310 prompt=2 llm_ttfb=1120 llm_total=2100 tts_ttfb=520 play=180 total=3810
```
Run 5 real turns, paste numbers back — those become the baseline the rest optimizes against.

## 2. Two response modes

Add `BrainOptions.mode: "everyday" | "deep"` (rename existing `voice|text|test` → keep `test`, map old `voice` to `everyday`).

- **Everyday** (default for orb): flash model, no reasoning, no quality, no history-summary, streamed reply, 4s hard cap. Target < 3.5s total.
- **Deep**: pro model + reasoning + quality. Triggered explicitly ("denk hier eens goed over na", "help me plannen", `?mode=deep`) or when Brain intent = `planning`/`brainstorm` and user opts in. Target < 8s, spinner allowed.

Router: keyword + intent-heuristic in `processVoiceInput` picks mode when caller passes `auto`.

## 3. Context Manager (relevance, not dump)

New file `src/lib/assistant/context-manager.ts`:
- Input: user utterance + full memory + context snapshot.
- Output: ≤ 400-token slice with only records whose tags/category/temporal-window match the utterance (cheap keyword + category scoring, no LLM).
- Replaces the full `buildContextSummary` blob in the voice path. Deep mode may still use the fuller summary.

Expected prompt reduction: 60–80 %.

## 4. Split the mega-prompt

Break `systemPrompt()` into three cached blocks concatenated per turn:
1. `PERSONALITY_PROMPT` — static, ~40 lines (identity, rules, tone). Never changes per user.
2. `PERSONA_BLOCK` — user's persona fragment.
3. `CONTEXT_BLOCK` — output of Context Manager only.
4. `ACTIONS_SCHEMA_HINT` — trimmed intent/suggested_actions rules (moved out of the giant prose block; the tool schema already enforces structure, so prose can shrink ~50 %).

Drop the 6 verbose in-prompt examples down to 2. The tool schema does the heavy lifting.

## 5. Stream the reply to TTS

Currently the pipeline waits for the full tool-call JSON, then calls ElevenLabs, then plays. First spoken word ≈ llm_total + tts_ttfb ≈ 2.5–4s.

- Fire a **parallel** non-tool streaming call for `reply` only (`stream: true`, plain text, low temp) at the same instant as the tool-call request.
- As soon as the first sentence arrives (≈ 400–800 ms), push it to ElevenLabs streaming endpoint (`/stream`) and start playback.
- Tool-call response arrives in parallel and drives suggested_actions / UI card.
- If streaming reply and tool reply diverge, tool reply wins for the card; spoken text is what user already heard.

This is the single biggest first-word-latency win (~1.5s off).

## 6. Cleanup

- Remove `runReasoning` and `runQualityCheck` from the everyday path entirely (already flagged off, but delete dead branches in the hot path).
- Cache `PERSONALITY_PROMPT` + tool schema JSON as module constants (already are; verify no per-turn rebuild).
- Persona `promptFragment` capped at 300 chars.

## Deliverables

1. `[perf]` instrumentation shipped first (one commit). User runs 5 turns, reports numbers.
2. Then in one follow-up: context-manager, prompt split, mode routing, streaming TTS.
3. Baseline vs post-optimization numbers in the reply.

## Technical notes

- Streaming reply uses `stream: true` on the gateway; parse SSE `data:` chunks; flush to ElevenLabs `/v1/text-to-speech/{id}/stream` per sentence boundary (`.`, `!`, `?`, newline).
- `AbortController` shared between streaming-reply call and tool-call call so a user re-tap cancels both.
- Keep the tool-call as source of truth for `intent` / `suggested_actions`; the streaming call only produces spoken text.
- Everyday-mode timeout drops from 6s → 4s for the tool-call; streaming reply has its own 3s first-token deadline before falling back to tool-call reply.
