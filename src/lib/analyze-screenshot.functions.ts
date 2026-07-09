/**
 * Screenshot -> afspraak/reminder extractor.
 * Neemt een base64-afbeelding (bv. screenshot van een uitnodiging, e-mail
 * of chat) en probeert er een afspraak of herinnering uit te halen via
 * Gemini vision. Slaat het resultaat op als ai_suggestion.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Extraction = {
  suggestion_type: "appointment" | "reminder" | "note";
  title: string;
  proposed_date: string | null;
  proposed_time: string | null;
  summary: string;
  confidence: "high" | "medium" | "low";
};

const SYSTEM_PROMPT = `Je bent een rustige assistent die uit een screenshot een afspraak of herinnering haalt.
De screenshot kan een uitnodiging, e-mail, agendabericht, WhatsApp-bericht of poster zijn.

Vandaag is ${new Date().toISOString().slice(0, 10)}.

Geef ALTIJD geldig JSON terug in exact dit formaat (geen markdown, geen extra tekst):
{
  "suggestion_type": "appointment" | "reminder" | "note",
  "title": "korte titel in het Nederlands, max 80 tekens",
  "proposed_date": "YYYY-MM-DD of null",
  "proposed_time": "HH:MM (24-uurs) of null",
  "summary": "één rustige zin die uitlegt wat je herkend hebt",
  "confidence": "high" | "medium" | "low"
}

Regels:
- Kies "appointment" als er duidelijk een datum + tijd + gebeurtenis staat.
- Kies "reminder" als er een taak of deadline is zonder duidelijke gebeurtenis.
- Kies "note" alleen als er echt geen datum of taak in staat.
- Als je twijfelt over de datum: proposed_date = null en confidence = "low".
- Titel is kort en warm, geen hoofdletters aan het begin van elk woord.`;

function fallback(): Extraction {
  return {
    suggestion_type: "note",
    title: "Screenshot bewaard",
    proposed_date: null,
    proposed_time: null,
    summary: "Ik kon er geen duidelijke afspraak uit halen.",
    confidence: "low",
  };
}

function parse(raw: string): Extraction {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return fallback();
    const p = JSON.parse(m[0]);
    const validTypes = ["appointment", "reminder", "note"];
    const type = validTypes.includes(p.suggestion_type) ? p.suggestion_type : "note";
    return {
      suggestion_type: type,
      title:
        typeof p.title === "string" && p.title.trim()
          ? p.title.slice(0, 200)
          : "Screenshot bewaard",
      proposed_date:
        typeof p.proposed_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.proposed_date)
          ? p.proposed_date
          : null,
      proposed_time:
        typeof p.proposed_time === "string" && /^\d{2}:\d{2}$/.test(p.proposed_time)
          ? p.proposed_time
          : null,
      summary:
        typeof p.summary === "string" && p.summary.trim()
          ? p.summary.slice(0, 400)
          : "Ik heb het bewaard als voorstel.",
      confidence: ["high", "medium", "low"].includes(p.confidence) ? p.confidence : "low",
    };
  } catch {
    return fallback();
  }
}

export const analyzeScreenshotForAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageDataUrl: string; note?: string }) => {
    if (!input || typeof input.imageDataUrl !== "string") {
      throw new Error("Afbeelding ontbreekt.");
    }
    if (!input.imageDataUrl.startsWith("data:image/")) {
      throw new Error("Ongeldig afbeeldingsformaat.");
    }
    // ~8MB base64 cap
    if (input.imageDataUrl.length > 11_000_000) {
      throw new Error("Afbeelding is te groot (max ~8MB).");
    }
    return {
      imageDataUrl: input.imageDataUrl,
      note: typeof input.note === "string" ? input.note.slice(0, 500) : "",
    };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is niet beschikbaar.");

    let extraction: Extraction;
    try {
      const userContent: Array<Record<string, unknown>> = [
        {
          type: "text",
          text: data.note
            ? `Extra context van de gebruiker: ${data.note}`
            : "Haal er een afspraak of herinnering uit als dat kan.",
        },
        { type: "image_url", image_url: { url: data.imageDataUrl } },
      ];

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error("Even te druk. Probeer het zo nog eens.");
        if (res.status === 402) throw new Error("AI-tegoed is op.");
        const body = await res.text().catch(() => "");
        console.error("[analyze-screenshot] gateway error", res.status, body.slice(0, 300));
        throw new Error("AI kon de afbeelding niet lezen.");
      }
      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      extraction = parse(content);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("druk") ||
          err.message.includes("tegoed") ||
          err.message.includes("lezen"))
      ) {
        throw err;
      }
      extraction = fallback();
    }

    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("ai_suggestions")
      .insert({
        user_id: userId,
        suggestion_type: extraction.suggestion_type,
        title: extraction.title,
        content: extraction.summary + (data.note ? `\n\nNotitie: ${data.note}` : ""),
        proposed_date: extraction.proposed_date,
        proposed_time: extraction.proposed_time,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[analyze-screenshot] insert error", error.message);
      throw new Error("Opslaan lukte niet.");
    }

    return {
      id: inserted.id,
      suggestion_type: extraction.suggestion_type,
      title: extraction.title,
      proposed_date: extraction.proposed_date,
      proposed_time: extraction.proposed_time,
      summary: extraction.summary,
      confidence: extraction.confidence,
    };
  });
