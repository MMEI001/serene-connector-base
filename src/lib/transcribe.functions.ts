import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSpeechProvider, TranscribeError } from "@/lib/voice/providers";

const MAX_BYTES = 25 * 1024 * 1024;
const RATE_LIMIT_PER_HOUR = 20;
// Whisper-1: $0.006 per minuut (alleen accuraat voor openai/whisper).
const COST_PER_SECOND = 0.006 / 60;

const RETRY_BACKOFF_MS = [1000, 3000, 7000]; // 3 pogingen totaal
const SOFT_WARN_WINDOW_MS = 5 * 60 * 1000;
const SOFT_WARN_THRESHOLD = 3;


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
    const { supabase, userId } = context;
    const provider = getSpeechProvider();

    // Rate limiting (per uur, per gebruiker)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await supabase
      .from("voice_transcriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);
    if (countErr) console.error("[transcribe] rate-count error", countErr);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      throw new Error(
        `Je hebt het limiet van ${RATE_LIMIT_PER_HOUR} spraak-opnames per uur bereikt. Probeer het later opnieuw.`,
      );
    }

    // Retry-loop: 3 pogingen, backoff 1s/3s/7s, alleen op retriable errors.
    let lastErr: TranscribeError | null = null;
    let result: Awaited<ReturnType<typeof provider.transcribe>> | null = null;
    for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
      try {
        result = await provider.transcribe({
          file: data.file,
          filename: data.name,
          language: "nl",
        });
        lastErr = null;
        break;
      } catch (err) {
        if (err instanceof TranscribeError) {
          lastErr = err;
          console.error(
            `[transcribe] ${provider.name} attempt ${attempt + 1} failed`,
            err.status,
            err.message,
          );
          if (!err.retriable || attempt === RETRY_BACKOFF_MS.length - 1) break;
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
          continue;
        }
        // Onbekende fout: niet retryen.
        const msg = err instanceof Error ? err.message : String(err);
        lastErr = new TranscribeError(msg, 0, false, "unknown");
        break;
      }
    }

    if (!result) {
      const status = lastErr?.status ?? 0;
      await supabase
        .from("voice_errors")
        .insert({
          user_id: userId,
          provider: provider.name,
          http_status: status || null,
          error_code: lastErr?.providerCode ?? null,
          stage: "transcribe",
        })
        .then(({ error }) => {
          if (error) console.error("[transcribe] voice_errors log failed", error);
        });

      // Soft-warning: 3+ fouten in laatste 5 min
      const since = new Date(Date.now() - SOFT_WARN_WINDOW_MS).toISOString();
      const { count: recentErrCount } = await supabase
        .from("voice_errors")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since);

      const soft = (recentErrCount ?? 0) >= SOFT_WARN_THRESHOLD;
      if (soft) {
        throw new Error("Het lijkt drukker bij onze taalverwerker. Probeer het zo nog eens.");
      }
      if (status === 429 || (status >= 500 && status <= 599)) {
        throw new Error("Even te druk bij onze taalverwerker. Probeer zo opnieuw.");
      }
      if (status === 401) throw new Error("Spraak-naar-tekst is niet correct geconfigureerd.");
      if (status === 0 && lastErr?.providerCode === "no_key") {
        throw new Error("Spraak-naar-tekst is niet geconfigureerd.");
      }
      throw new Error("Transcriptie lukte niet. Probeer opnieuw.");
    }

    const text = result.text;
    const duration = result.duration_seconds;
    const bytes = data.file.size;
    const estCost =
      provider.name === "openai" && duration != null
        ? Number((duration * COST_PER_SECOND).toFixed(6))
        : null;

    const { data: logRow, error: logErr } = await supabase
      .from("voice_transcriptions")
      .insert({
        user_id: userId,
        duration_seconds: duration,
        estimated_cost_usd: estCost,
        bytes,
        model: result.model,
      })
      .select("id")
      .single();
    if (logErr) console.error("[transcribe] log insert failed", logErr);

    return {
      text,
      duration_seconds: duration,
      estimated_cost_usd: estCost,
      transcription_id: (logRow?.id as string | undefined) ?? null,
      provider: provider.name,
    };
  });

/**
 * Telt mislukte transcripties van de huidige gebruiker in de laatste 5 minuten.
 * Gebruikt door de orb-UI om een zachte "het is drukker" hint te tonen.
 */
export const getRecentVoiceErrorCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - SOFT_WARN_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from("voice_errors")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    return { count: count ?? 0, threshold: SOFT_WARN_THRESHOLD };
  });
