import { TranscribeError, type SpeechProvider, type TranscribeInput, type TranscribeOutput } from "./types";

const MODEL = "whisper-1";

export const openaiProvider: SpeechProvider = {
  name: "openai",
  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new TranscribeError("OpenAI API key niet geconfigureerd.", 0, false, "no_key");
    }

    const fd = new FormData();
    fd.append("file", input.file, input.filename);
    fd.append("model", MODEL);
    if (input.language) fd.append("language", input.language);
    fd.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    if (!res.ok) {
      const status = res.status;
      const body = await res.text().catch(() => "");
      const retriable = status === 429 || (status >= 500 && status <= 599);
      throw new TranscribeError(
        `OpenAI gaf status ${status}: ${body.slice(0, 200)}`,
        status,
        retriable,
      );
    }

    const json = (await res.json()) as { text?: string; duration?: number };
    return {
      text: (json.text ?? "").trim(),
      duration_seconds: typeof json.duration === "number" ? json.duration : null,
      model: MODEL,
    };
  },
};
