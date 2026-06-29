// Supabase Edge Function: text-to-speech
// Converts text to speech via ElevenLabs and returns audio/mpeg.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-voice-id, x-voice-model, x-voice-provider",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte
const ALLOWED_VOICE_IDS = new Set([
  "XB0fDUnXU5powFXDhCwa",
  "Xb7hH8MSUJpSbSDYk0k2",
  "pFZP5JQG7iQjIQuC4Bku",
  "nPczCjzI2devNBz1zQrb",
  "onwK4e9ZLuTAKqWW03F9",
]);
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 1000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
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
    if (!text || typeof text !== "string") {
      return json({ error: "text is verplicht" }, 400);
    }
    if (text.length > MAX_CHARS) {
      return json({ error: "Tekst is te lang" }, 400);
    }

    const voiceId = ALLOWED_VOICE_IDS.has(requestedVoiceId)
      ? requestedVoiceId
      : DEFAULT_VOICE_ID;
    console.log("[TTS] voice_id", voiceId);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("ElevenLabs error", resp.status, detail);
      const fallbackable = resp.status === 401 || resp.status === 402 ||
        resp.status === 429 || resp.status >= 500;
      return json(
        { error: "tts_unavailable", fallback: fallbackable, upstream_status: resp.status },
        fallbackable ? 200 : resp.status,
      );
    }
    console.log("[TTS] ElevenLabs status", resp.status);

    const audio = await resp.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "x-voice-provider": "elevenlabs",
        "x-voice-id": voiceId,
        "x-voice-model": MODEL_ID,
      },
    });
  } catch (err) {
    console.error("text-to-speech crashed", err);
    return json({ error: "Onverwachte fout" }, 500);
  }
});
