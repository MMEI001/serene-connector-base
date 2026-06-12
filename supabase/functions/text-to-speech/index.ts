// Supabase Edge Function: text-to-speech
// Converts text to speech via ElevenLabs and returns audio/mpeg.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VOICE_ID = "XrExE9yKIg1WjnnlVkGX"; // Matilda — calm, warm
const MODEL_ID = "eleven_multilingual_v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY ontbreekt" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "text is verplicht" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;

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
      return new Response(
        JSON.stringify({ error: "TTS-fout", status: resp.status, detail }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const audio = await resp.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("text-to-speech crashed", err);
    return new Response(
      JSON.stringify({
        error: "Onverwachte fout",
        details: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
