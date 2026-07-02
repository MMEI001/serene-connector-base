/**
 * Web-synthesis — tweede Brain-call.
 *
 * Neemt de ruwe web-hits en zet ze om in een kort natuurlijk antwoord +
 * een gefilterde, uniforme productenlijst. Prijs/aanbieding komt alleen mee
 * als het letterlijk in de bron staat.
 */

import type { WebHit } from "./web-search.server";
import type { ProductCardData } from "@/components/product-card";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

type SynthResult = {
  reply: string;
  products: ProductCardData[];
};

const SCHEMA = {
  type: "function" as const,
  function: {
    name: "answer",
    description: "Beantwoord de gebruiker met een korte reply en max 5 productkaarten.",
    parameters: {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description:
            "Kort, natuurlijk Nederlands antwoord (2–4 zinnen). Combineer bronnen als dat helpt (bv. 'AH heeft X, bij Gall & Gall is Y goedkoper'). Noem NOOIT dat je hebt gezocht of een tool hebt gebruikt. Nooit verzonnen prijzen. Eindig met een vriendelijk voorstel om iets op de boodschappenlijst te zetten.",
        },
        products: {
          type: "array",
          maxItems: 5,
          description:
            "Max 5 relevante items uit de gegeven bronnen. Neem NIETS op wat niet in de bronnen staat. Gebruik precies de URL uit de bron.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Korte, duidelijke productnaam." },
              store: { type: "string", description: "Winkelnaam uit de bron (bv. 'Albert Heijn'). Leeg als onbekend." },
              price: {
                type: "string",
                description:
                  "Prijs of aanbieding LETTERLIJK zoals in de bron (bv. '€4,99', '2 voor €10'). Leeg als niet in bron.",
              },
              url: { type: "string", description: "Volledige URL uit de bron." },
              image: { type: "string", description: "Afbeeldings-URL uit de bron. Leeg als geen." },
              note: { type: "string", description: "Optionele korte extra info uit de bron (max 100 tekens)." },
            },
            required: ["name", "url"],
          },
        },
      },
      required: ["reply", "products"],
    },
  },
};

function hitsToContext(hits: WebHit[]): string {
  return hits
    .map((h, i) => {
      const parts: string[] = [`[#${i + 1}]`];
      parts.push(`Titel: ${h.title}`);
      if (h.store) parts.push(`Winkel: ${h.store}`);
      if (h.price) parts.push(`Prijs (uit bron): ${h.price}`);
      parts.push(`URL: ${h.url}`);
      if (h.image) parts.push(`Afbeelding: ${h.image}`);
      if (h.snippet) parts.push(`Samenvatting: ${h.snippet}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

/**
 * Fallback wanneer de synth-call faalt: neem de eerste 5 hits letterlijk over.
 */
function hitsToProducts(hits: WebHit[]): ProductCardData[] {
  return hits.slice(0, 5).map((h) => ({
    name: h.title,
    url: h.url,
    store: h.store ?? "",
    price: h.price ?? "",
    image: h.image ?? "",
  }));
}

export async function synthesizeWithWeb(
  userText: string,
  hits: WebHit[],
): Promise<SynthResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || hits.length === 0) {
    return {
      reply:
        hits.length === 0
          ? "Ik kon nu even geen actuele informatie ophalen. Wil je dat ik het op een andere manier probeer?"
          : "",
      products: hitsToProducts(hits),
    };
  }

  const system = `Je bent HoofdRust — een warme, praktische Nederlandse assistent. Je hebt zojuist actuele webresultaten binnengekregen en gebruikt die om de gebruiker kort te helpen. Regels:
- Antwoord natuurlijk, alsof je het zelf weet. Noem NIET dat je hebt gezocht.
- Gebruik alleen prijs/aanbieding als die letterlijk in een bron staat.
- Verzin niets. Als bronnen weinig zeggen, wees eerlijk kort.
- Combineer gerust bronnen ("Bij Albert Heijn X, bij Gall & Gall Y").
- Max 5 producten. Neem exact de URL uit de bron over.
- Eindig met een korte uitnodiging om er één op de boodschappenlijst te zetten.
- Antwoord in het Nederlands, spreektaal, 2–4 zinnen voor de reply.`;

  const userMsg = `Gebruikersvraag:
${userText}

Actuele bronnen:
${hitsToContext(hits)}`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [SCHEMA],
        tool_choice: { type: "function", function: { name: "answer" } },
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      console.warn("[web-synth] gateway", res.status);
      return { reply: "", products: hitsToProducts(hits) };
    }
    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    } | null;
    const raw = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!raw) return { reply: "", products: hitsToProducts(hits) };
    const parsed = JSON.parse(raw) as {
      reply?: string;
      products?: Array<{
        name?: string;
        store?: string;
        price?: string;
        url?: string;
        image?: string;
        note?: string;
      }>;
    };

    const allowedUrls = new Set(hits.map((h) => h.url));
    const products: ProductCardData[] = [];
    for (const p of parsed.products ?? []) {
      if (!p?.url || !p.name) continue;
      // Alleen URLs die ook in de bronnen zaten (voorkomt verzinsels).
      if (!allowedUrls.has(p.url)) continue;
      // Verrijk image als LLM 'm heeft weggelaten.
      const src = hits.find((h) => h.url === p.url);
      products.push({
        name: p.name.trim().slice(0, 160),
        url: p.url,
        store: (p.store ?? src?.store ?? "").trim(),
        price: (p.price ?? "").trim(),
        image: (p.image ?? src?.image ?? "").trim(),
        note: (p.note ?? "").trim().slice(0, 120),
      });
      if (products.length >= 5) break;
    }

    return {
      reply: (parsed.reply ?? "").trim(),
      products: products.length > 0 ? products : hitsToProducts(hits),
    };
  } catch (err) {
    console.warn("[web-synth] error", (err as Error).message);
    return { reply: "", products: hitsToProducts(hits) };
  }
}
