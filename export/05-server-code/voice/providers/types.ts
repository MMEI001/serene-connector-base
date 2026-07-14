// Provider-abstractie voor spraak-naar-tekst.
// Fase A: alleen "openai" geïmplementeerd. Deepgram/Google zijn stubs
// die fail-fast werken zodra ze worden geselecteerd via SPEECH_PROVIDER.

export type SpeechProviderName = "openai" | "deepgram" | "google";

export type TranscribeInput = {
  file: Blob;
  filename: string;
  language?: string; // ISO-639-1, bv "nl"
};

export type TranscribeOutput = {
  text: string;
  duration_seconds: number | null;
  model: string;
};

export class TranscribeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retriable: boolean,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

export interface SpeechProvider {
  name: SpeechProviderName;
  transcribe(input: TranscribeInput): Promise<TranscribeOutput>;
}
