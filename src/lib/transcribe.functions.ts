import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI limiet
const RATE_LIMIT_PER_HOUR = 20;
// Whisper-1: $0.006 per minuut
const COST_PER_SECOND = 0.006 / 60;

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FormData) => {
    if (!(data instanceof FormData)) {
      throw new Error("Verwacht een audio-upload.");
    }
    const file = data.get("file");
    if (!(file instanceof Blob)) {
      throw new Error("Geen audio-bestand ontvangen.");
    }
    if (file.size < 512) {
      throw new Error("Opname was te kort of leeg. Probeer opnieuw.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("Opname te groot (max 25 MB).");
    }
    const name = file instanceof File ? file.name : "recording.webm";
    return { file, name: name || "recording.webm" };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Spraak-naar-tekst is niet geconfigureerd.");

    const { supabase, userId } = context;

    // Rate limiting: tel transcripties van laatste uur
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await supabase
      .from("voice_transcriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);
    if (countErr) {
      console.error("[transcribe] rate-count error", countErr);
    }
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      throw new Error(
        `Je hebt het limiet van ${RATE_LIMIT_PER_HOUR} spraak-opnames per uur bereikt. Probeer het later opnieuw.`,
      );
    }

    // Forward naar OpenAI Whisper
    const upstream = new FormData();
    upstream.append("file", data.file, data.name);
    upstream.append("model", "whisper-1");
    upstream.append("language", "nl");
    upstream.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[transcribe] OpenAI error", res.status, errText);
      if (res.status === 429) throw new Error("Even te druk bij OpenAI. Probeer opnieuw.");
      if (res.status === 401) throw new Error("Spraak-naar-tekst is niet correct geconfigureerd.");
      throw new Error("Transcriptie lukte niet. Probeer opnieuw.");
    }

    const json = (await res.json()) as { text?: string; duration?: number };
    const text = (json.text ?? "").trim();
    const duration = typeof json.duration === "number" ? json.duration : null;
    const bytes = data.file.size;
    const estCost = duration != null ? Number((duration * COST_PER_SECOND).toFixed(6)) : null;

    // Kosten-logging
    const { error: logErr } = await supabase.from("voice_transcriptions").insert({
      user_id: userId,
      duration_seconds: duration,
      estimated_cost_usd: estCost,
      bytes,
      model: "whisper-1",
    });
    if (logErr) {
      console.error("[transcribe] log insert failed", logErr);
    }

    return { text, duration_seconds: duration, estimated_cost_usd: estCost };
  });
