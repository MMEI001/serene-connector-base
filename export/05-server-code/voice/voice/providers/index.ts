import type { SpeechProvider, SpeechProviderName } from "./types";
import { openaiProvider } from "./openai";
import { deepgramProvider } from "./deepgram";
import { googleProvider } from "./google";

const REGISTRY: Record<SpeechProviderName, SpeechProvider> = {
  openai: openaiProvider,
  deepgram: deepgramProvider,
  google: googleProvider,
};

export function getSpeechProvider(): SpeechProvider {
  const raw = (process.env.SPEECH_PROVIDER ?? "openai").toLowerCase() as SpeechProviderName;
  return REGISTRY[raw] ?? openaiProvider;
}

export { TranscribeError } from "./types";
export type { SpeechProvider, SpeechProviderName, TranscribeInput, TranscribeOutput } from "./types";
