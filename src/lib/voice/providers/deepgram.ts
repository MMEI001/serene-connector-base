import { TranscribeError, type SpeechProvider, type TranscribeInput, type TranscribeOutput } from "./types";

// Stub-provider. Wordt geactiveerd zodra SPEECH_PROVIDER=deepgram en
// DEEPGRAM_API_KEY zijn gezet. Implementatie volgt in fase C.
export const deepgramProvider: SpeechProvider = {
  name: "deepgram",
  async transcribe(_input: TranscribeInput): Promise<TranscribeOutput> {
    throw new TranscribeError(
      "Deepgram-provider is nog niet geïmplementeerd.",
      0,
      false,
      "not_implemented",
    );
  },
};
