import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Classification = {
  suggestion_type: "appointment" | "reminder" | "note" | "let_go";
  title: string;
  proposed_date: string | null;
  proposed_time: string | null;
  confidence: "high" | "medium" | "low";
};

const SYSTEM_PROMPT = `Je bent een rustige assistent die vrije tekst van een gebruiker classificeert.
Bepaal welk type item het beste past:
- "appointment": een afspraak op een specifiek moment (datum, vaak ook tijd).
- "reminder": een herinnering of taak om iets te doen, eventueel met datum/tijd.
- "note": een gedachte, observatie of iets om te onthouden zonder actie.
- "let_go": iets dat de gebruiker uit het hoofd wil laten, zonder er iets mee te doen.

Geef ALTIJD geldig JSON terug, exact in dit formaat (geen extra tekst, geen markdown):
{
  "suggestion_type": "appointment" | "reminder" | "note" | "let_go",
  "title": "korte, rustige titel in het Nederlands (max 80 tekens)",
  "proposed_date": "YYYY-MM-DD of null",
  "proposed_time": "HH:MM of null",
  "confidence": "high" | "medium" | "low"
}

Regels:
- Vandaag is ${new Date().toISOString().slice(0, 10)}.
- Bij twijfel tussen note en let_go: kies note.
- Als er geen duidelijke datum is: proposed_date = null.
- Als er geen duidelijke tijd is: proposed_time = null.
- Zet confidence op "low" als je twijfelt.`;

function fallback(): Classification {
  return {
    suggestion_type: "note",
    title: "Nieuw voorstel",
    proposed_date: null,
    proposed_time: null,
    confidence: "low",
  };
}

function parseClassification(raw: string): Classification {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback();
    const parsed = JSON.parse(jsonMatch[0]);
    const validTypes = ["appointment", "reminder", "note", "let_go"];
    if (!validTypes.includes(parsed.suggestion_type)) {
      return { ...fallback(), title: typeof parsed.title === "string" ? parsed.title : "Nieuw voorstel" };
    }
    return {
      suggestion_type: parsed.suggestion_type,
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.slice(0, 200) : "Nieuw voorstel",
      proposed_date: typeof parsed.proposed_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.proposed_date) ? parsed.proposed_date : null,
      proposed_time: typeof parsed.proposed_time === "string" && /^\d{2}:\d{2}$/.test(parsed.proposed_time) ? parsed.proposed_time : null,
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
    };
  } catch {
    return fallback();
  }
}

export const classifyAndStoreSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string }) => {
    if (!input || typeof input.text !== "string" || !input.text.trim()) {
      throw new Error("Tekst is verplicht.");
    }
    if (input.text.length > 4000) {
      throw new Error("Tekst is te lang.");
    }
    return { text: input.text.trim() };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is niet beschikbaar.");

    let classification: Classification;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "raw-fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: data.text },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error("Even te druk. Probeer het zo nog eens.");
        if (res.status === 402) throw new Error("AI-tegoed is op.");
        throw new Error("AI gaf een fout terug.");
      }
      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      classification = parseClassification(content);
    } catch (err) {
      if (err instanceof Error && (err.message.includes("druk") || err.message.includes("tegoed"))) {
        throw err;
      }
      classification = fallback();
    }

    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("ai_suggestions")
      .insert({
        user_id: userId,
        suggestion_type: classification.suggestion_type,
        title: classification.title,
        content: data.text,
        proposed_date: classification.proposed_date,
        proposed_time: classification.proposed_time,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw new Error("Opslaan lukte niet.");

    return {
      id: inserted.id,
      suggestion_type: classification.suggestion_type,
      confidence: classification.confidence,
    };
  });
