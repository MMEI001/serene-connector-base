import { TranscribeError, type SpeechProvider, type TranscribeInput, type TranscribeOutput } from "./types";

// Stub-provider voor Google Cloud Speech-to-Text. Implementatie volgt in fase C.
export const googleProvider: SpeechProvider = {
  name: "google",
  async transcribe(_input: TranscribeInput): Promise<TranscribeOutput> {
    throw new TranscribeError(
      "Google Speech-provider is nog niet geïmplementeerd.",
      0,
      false,
      "not_implemented",
    );
  },
};
