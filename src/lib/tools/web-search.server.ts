/**
 * Web-search hulpmiddel — Firecrawl.
 *
 * Server-only. Wordt gebruikt door de Brain wanneer een antwoord actuele
 * externe informatie nodig heeft (aanbiedingen, prijzen, openingstijden,
 * nieuws, beschikbaarheid, evenementen). Geen aparte intent — dit is een
 * onzichtbaar hulpmiddel dat door de synthese-laag wordt aangeroepen.
 */

import Firecrawl from "@mendable/firecrawl-js";

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
  store: string | null;
  price: string | null;
  image: string | null;
};

const STORE_MAP: Array<{ host: RegExp; name: string }> = [
  { host: /(^|\.)ah\.nl$/i, name: "Albert Heijn" },
  { host: /(^|\.)appie\.nl$/i, name: "Albert Heijn" },
  { host: /(^|\.)jumbo\.com$/i, name: "Jumbo" },
  { host: /(^|\.)plus\.nl$/i, name: "PLUS" },
  { host: /(^|\.)lidl\.nl$/i, name: "Lidl" },
  { host: /(^|\.)aldi\.nl$/i, name: "Aldi" },
  { host: /(^|\.)dirk\.nl$/i, name: "Dirk" },
  { host: /(^|\.)hoogvliet\.com$/i, name: "Hoogvliet" },
  { host: /(^|\.)coop\.nl$/i, name: "Coop" },
  { host: /(^|\.)vomar\.nl$/i, name: "Vomar" },
  { host: /(^|\.)ekoplaza\.nl$/i, name: "Ekoplaza" },
  { host: /(^|\.)gall\.nl$/i, name: "Gall & Gall" },
  { host: /(^|\.)mitra\.nl$/i, name: "Mitra" },
  { host: /(^|\.)slijterijendekoning\.nl$/i, name: "De Koning" },
  { host: /(^|\.)bol\.com$/i, name: "bol.com" },
  { host: /(^|\.)coolblue\.nl$/i, name: "Coolblue" },
  { host: /(^|\.)mediamarkt\.nl$/i, name: "MediaMarkt" },
  { host: /(^|\.)hema\.nl$/i, name: "HEMA" },
  { host: /(^|\.)action\.com$/i, name: "Action" },
  { host: /(^|\.)ikea\.com$/i, name: "IKEA" },
];

function storeFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    for (const { host: re, name } of STORE_MAP) {
      if (re.test(host)) return name;
    }
    // Fallback: hostname without leading www./m. and TLD.
    return host.replace(/^(www\.|m\.)/i, "").replace(/\.(nl|com|be|eu)$/i, "");
  } catch {
    return null;
  }
}

/** Trek de eerste EUR-prijs uit een tekst. Nooit verzinnen — alleen letterlijk. */
function extractPrice(text: string | undefined | null): string | null {
  if (!text) return null;
  // Formaten: €4,99  €4.99  4,99  4.99 EUR  € 4,99
  const m = text.match(/€\s?\d{1,3}(?:[.,]\d{2})?|(?<!\S)\d{1,3}[.,]\d{2}\s?(?:EUR|euro)?/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function extractImage(markdown: string | undefined | null): string | null {
  if (!markdown) return null;
  const m = markdown.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
  return m ? m[1] : null;
}

type RawDoc = {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
  metadata?: { title?: string; description?: string; sourceURL?: string; ogImage?: string };
};

function normalize(doc: RawDoc): WebHit | null {
  const url = doc.url ?? doc.metadata?.sourceURL ?? "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = (doc.title ?? doc.metadata?.title ?? url).trim().slice(0, 200);
  const snippetSrc = doc.description ?? doc.metadata?.description ?? doc.markdown ?? "";
  const snippet = snippetSrc.replace(/\s+/g, " ").trim().slice(0, 400);
  const price = extractPrice(snippet) ?? extractPrice(doc.markdown);
  const image = doc.metadata?.ogImage ?? extractImage(doc.markdown);
  return {
    title,
    url,
    snippet,
    store: storeFromUrl(url),
    price,
    image,
  };
}

/** Draai een query via Firecrawl search (NL, kort, geen full scrape). */
async function runOne(client: Firecrawl, query: string, limit: number): Promise<WebHit[]> {
  try {
    // SDK v4: search returnt { web?: RawDoc[] } (zonder scrape) of vergelijkbaar.
    const res = (await client.search(query, {
      limit,
      location: "nl",
    })) as unknown as { web?: RawDoc[]; data?: RawDoc[] };
    const docs = res?.web ?? res?.data ?? [];
    const hits: WebHit[] = [];
    for (const d of docs) {
      const n = normalize(d);
      if (n) hits.push(n);
    }
    return hits;
  } catch (err) {
    console.warn("[web-search] firecrawl error", query, (err as Error).message);
    return [];
  }
}

export type WebSearchOptions = {
  limit?: number;
  timeoutMs?: number;
};

/**
 * Voer meerdere queries parallel uit, dedupe op host+title, cap totaal.
 * Geen throw — falen levert lege array op.
 */
export async function webSearch(
  queries: string[],
  opts: WebSearchOptions = {},
): Promise<WebHit[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[web-search] FIRECRAWL_API_KEY ontbreekt");
    return [];
  }
  const cleaned = Array.from(
    new Set(queries.map((q) => q.trim()).filter((q) => q.length >= 3)),
  ).slice(0, 3);
  if (cleaned.length === 0) return [];

  const limit = Math.max(3, Math.min(opts.limit ?? 5, 8));
  const timeoutMs = opts.timeoutMs ?? 9000;
  const client = new Firecrawl({ apiKey });

  const runs = cleaned.map((q) => runOne(client, q, limit));
  const timeoutP = new Promise<WebHit[][]>((resolve) =>
    setTimeout(() => resolve([]), timeoutMs),
  );

  const raced = await Promise.race([Promise.all(runs), timeoutP]);
  const results = Array.isArray(raced) && raced.length > 0 ? raced : [];

  // Merge + dedupe.
  const seen = new Set<string>();
  const merged: WebHit[] = [];
  for (const arr of results) {
    for (const h of arr) {
      const key = `${h.store ?? ""}|${h.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(h);
      if (merged.length >= 10) break;
    }
    if (merged.length >= 10) break;
  }

  // Verrijk ontbrekende afbeeldingen via OpenGraph van de bronpagina.
  await enrichImages(merged, 3500);
  return merged;
}

/** Haal een pagina op (kort) en trek og:image / twitter:image. */
async function fetchOgImage(pageUrl: string, timeoutMs: number): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(pageUrl, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HoofdRustBot/1.0; +https://hoofdrust.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    }).catch(() => null);
    clearTimeout(t);
    if (!res || !res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    const MAX = 120_000;
    while (bytes < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }

    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return absolutize(m[1], pageUrl);
    }
    return null;
  } catch {
    return null;
  }
}

function absolutize(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

async function enrichImages(hits: WebHit[], timeoutMs: number): Promise<void> {
  const targets = hits.filter((h) => !h.image);
  if (targets.length === 0) return;
  const budget = new Promise<void>((r) => setTimeout(r, timeoutMs + 500));
  const jobs = targets.map(async (h) => {
    const img = await fetchOgImage(h.url, timeoutMs);
    if (img) h.image = img;
  });
  await Promise.race([Promise.all(jobs), budget]);
}

