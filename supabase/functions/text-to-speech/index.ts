// Supabase Edge Function: text-to-speech
// Converts text to speech via ElevenLabs and returns audio/mpeg.
// Includes voice_id diagnostics and safe fallback to a known-working voice.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers":
    "x-voice-id, x-voice-model, x-voice-provider, x-voice-fallback, x-voice-requested",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Sarah — algemeen beschikbare ElevenLabs standaardstem. Werkt op elk account.
const FALLBACK_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah
// Charlotte — gewenste stem, maar niet gegarandeerd beschikbaar op elk account.
const CHARLOTTE_VOICE_ID = "XB0fDUnXU5powFXDhCwa";
const DEFAULT_VOICE_ID = FALLBACK_VOICE_ID;

const ALLOWED_VOICE_IDS = new Set([
  CHARLOTTE_VOICE_ID,
  FALLBACK_VOICE_ID,
  "Xb7hH8MSUJpSbSDYk0k2", // Alice (v)
  "pFZP5JQG7iQjIQuC4Bku", // Lily (v)
  "FGY2WhTYpPnrIDTdsKH5", // Laura (v)
  "XrExE9yKIg1WjnnlVkGX", // Matilda (v)
  "cgSgspJ2msm6clMCkdW9", // Jessica (v)
  "nPczCjzI2devNBz1zQrb", // Brian (m)
  "onwK4e9ZLuTAKqWW03F9", // Daniel (m)
  "JBFqnCBsd6RMkjVDRZzb", // George (m)
  "CwhRBWXzGAHq8TQ4Fs17", // Roger (m)
  "IKne3meq5aSn9XLyUdCD", // Charlie (m)
  "TX3LPaxmHKxFdv7VOQHJ", // Liam (m)
  "bIHbv24MWmeRgasZH58o", // Will (m)
  "cjVigY5qzO86Huf0OWal", // Eric (m)
]);
// Flash v2.5 = laagste latency; multilingual v2 = beter Nederlands (natuurlijker).
const FAST_MODEL_ID = "eleven_flash_v2_5";
const NATURAL_MODEL_ID = "eleven_multilingual_v2";
const ALLOWED_MODELS = new Set([FAST_MODEL_ID, NATURAL_MODEL_ID]);
const MAX_CHARS = 1000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function synthesize(
  apiKey: string,
  voiceId: string,
  text: string,
  modelId: string,
): Promise<
  | { ok: true; body: ReadableStream<Uint8Array>; contentType: string; status: number }
  | { ok: false; status: number; contentType: string; detail: string }
> {
  // Bij "natuurlijk" model latency-optimalisatie iets verlagen om NL-uitspraak
  // niet te schaden; bij flash mag hij op max.
  const latency = modelId === FAST_MODEL_ID ? 3 : 2;
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64&optimize_streaming_latency=${latency}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        use_speaker_boost: true,
      },
    }),
  });

  const contentType = resp.headers.get("content-type") || "";
  if (!resp.ok || !contentType.includes("audio") || !resp.body) {
    const detail = await resp.text().catch(() => "");
    console.error(
      "[TTS] ElevenLabs non-audio",
      { voiceId, status: resp.status, contentType, detailPreview: detail.slice(0, 400) },
    );
    return { ok: false, status: resp.status, contentType, detail };
  }
  console.log("[TTS] ElevenLabs streaming start", { voiceId, status: resp.status, contentType });
  return { ok: true, body: resp.body, contentType, status: resp.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !supabaseAnon) {
      console.error("Supabase env missing");
      return json({ error: "Server misconfigured" }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("ELEVENLABS_API_KEY ontbreekt");
      return json({ error: "Spraak is tijdelijk niet beschikbaar." }, 503);
    }

    const body = await req.json().catch(() => null);
    const text = body?.text;
    const requestedVoiceId = typeof body?.voice_id === "string" ? body.voice_id : "";
    const requestedModel = typeof body?.model_id === "string" ? body.model_id : "";
    if (!text || typeof text !== "string") {
      return json({ error: "text is verplicht" }, 400);
    }
    if (text.length > MAX_CHARS) {
      return json({ error: "Tekst is te lang" }, 400);
    }

    const primaryVoiceId = ALLOWED_VOICE_IDS.has(requestedVoiceId)
      ? requestedVoiceId
      : DEFAULT_VOICE_ID;
    const modelId = ALLOWED_MODELS.has(requestedModel) ? requestedModel : FAST_MODEL_ID;
    console.log("[TTS] request", {
      requestedVoiceId,
      primaryVoiceId,
      modelId,
      fallbackVoiceId: FALLBACK_VOICE_ID,
      textLen: text.length,
    });

    let usedVoiceId = primaryVoiceId;
    let result = await synthesize(apiKey, primaryVoiceId, text, modelId);
    let didFallback = false;

    if (!result.ok && primaryVoiceId !== FALLBACK_VOICE_ID) {
      console.warn(
        "[TTS] primary voice failed, retrying with fallback",
        { primaryVoiceId, fallbackVoiceId: FALLBACK_VOICE_ID, primaryStatus: result.status },
      );
      const fallback = await synthesize(apiKey, FALLBACK_VOICE_ID, text, modelId);
      if (fallback.ok) {
        result = fallback;
        usedVoiceId = FALLBACK_VOICE_ID;
        didFallback = true;
      }
    }

    if (!result.ok) {
      return json(
        {
          error: "tts_unavailable",
          fallback: true,
          upstream_status: result.status,
          upstream_content_type: result.contentType,
          upstream_detail: result.detail.slice(0, 500),
          requested_voice_id: requestedVoiceId,
          primary_voice_id: primaryVoiceId,
        },
        200,
      );
    }

    return new Response(result.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Transfer-Encoding": "chunked",
        "x-voice-provider": "elevenlabs",
        "x-voice-id": usedVoiceId,
        "x-voice-requested": requestedVoiceId || primaryVoiceId,
        "x-voice-fallback": didFallback ? "true" : "false",
        "x-voice-model": modelId,
      },
    });
  } catch (err) {
    console.error("text-to-speech crashed", err);
    return json({ error: "Onverwachte fout" }, 500);
  }
});
