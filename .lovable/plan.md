# Firecrawl als Brain-tool voor HoofdRust

## Filosofie

Firecrawl wordt **geen** aparte intent en **geen** aparte UI-flow. Het is een onzichtbaar hulpmiddel dat de Brain zelf gebruikt wanneer het antwoord actuele informatie vereist. De gebruiker praat gewoon met HoofdRust; het voelt alsof HoofdRust het antwoord zelf weet.

## Aanpak

### 1. Firecrawl aansluiten
- Firecrawl-connector linken via `standard_connectors--connect` → geeft `FIRECRAWL_API_KEY` in de server-env.
- Nieuwe server-only helper `src/lib/tools/web-search.server.ts` met twee interne functies:
  - `webSearch(query, { limit, site?, country: "nl", lang: "nl" })` → `search` + korte scrape (markdown, `onlyMainContent`).
  - `webScrape(url, { formats: ["markdown", "json"] })` → voor detail-verrijking (prijs, afbeelding).
- Time-out (8s), max 5 hits, geen retries in-loop. Alle output genormaliseerd naar `WebHit { title, url, snippet, price?, image?, store? }`.
- `store` afgeleid uit hostname (ah.nl → "Albert Heijn", gall.nl → "Gall & Gall", jumbo.com → "Jumbo", enz.).

### 2. Brain krijgt "needs_live_info"-beslissing
- In `process-voice-input.ts` breidt de bestaande JSON-schema-response uit met twee optionele velden:
  - `needs_live_info: boolean`
  - `live_queries: string[]` (max 2, kort, Nederlands, mag `site:` bevatten)
- System-prompt krijgt duidelijke categorielijst:
  - **Wel**: aanbiedingen, prijzen, producten, winkels, openingstijden, websites, nieuws, beschikbaarheid, evenementen, actuele feiten.
  - **Niet**: recepten, algemeen advies, koken, opvoeding, planning, mentale steun, brainstormen.
- Geen aparte intent; Brain blijft `assistant_chat` teruggeven.

### 3. Twee-fasen-flow in de pipeline
In `src/lib/assistant/pipeline.ts` na de Conversation-engine:

```
Conversation (turn 1)
  ↓ needs_live_info?
  ├─ nee → normale flow
  └─ ja  → webSearch(live_queries) parallel
          → resultaten samenvoegen (dedupe op host+titel)
          → tweede Brain-call (synthese) met resultaten als extra system-message
          → Brain schrijft natuurlijk antwoord + kiest max 5 producten
          → antwoord + products[] doorzetten naar UI
```

De tweede call gebruikt hetzelfde model met een strikte prompt:
- Alleen prijs/aanbieding noemen als het letterlijk in de bron staat.
- Mag bronnen combineren ("AH heeft X, bij Gall & Gall Y").
- Max 5 producten, gerangschikt op relevantie.

Toegevoegd aan `AssistantResult`: `products?: ProductCardData[]`.

### 4. Uniforme ProductCard
Nieuwe component `src/components/product-card.tsx`:
- Afbeelding (of neutrale placeholder als geen bron-image).
- Naam, winkel-badge, optionele prijs.
- Klikbare titel/afbeelding (target=_blank, rel=noopener).
- Knop **"Toevoegen aan boodschappenlijst"** → maakt via bestaande note-flow een note aan met titel = product-naam, body = winkel + prijs + url.

`voice-orb.tsx` toont `products` net als `experience_card` — een lijst kaartjes onder de reply.

### 5. History-verrijking
Gevonden producten + gekozen items komen in `historyRef` als korte assistant-samenvatting, zodat vervolgvragen ("zet de eerste op mijn lijst", "de goedkoopste graag") context hebben.

## Uit scope (nu niet)
- Geen prijsvergelijkings-crawls over veel winkels tegelijk (blijft bij wat Firecrawl-search teruggeeft).
- Geen persistente product-cache.
- Nog geen automatische valuta-conversie.

## Bestanden (nieuw/aangepast)

Nieuw:
- `src/lib/tools/web-search.server.ts` — Firecrawl-wrapper + normalisatie.
- `src/components/product-card.tsx` — uniforme kaart met add-to-list.
- `src/lib/assistant/tool-runner.ts` — voert `live_queries` parallel uit, dedupe, budget.

Aangepast:
- `src/lib/voice/process-voice-input.ts` — schema-uitbreiding + prompt-instructie.
- `src/lib/assistant/pipeline.ts` — tweede Brain-call na tool-run, doorzet `products`.
- `src/lib/assistant/types.ts` — `AssistantResult.products`.
- `src/components/voice-orb.tsx` — render `products` onder reply.

## Wat ik nu ga doen
1. Firecrawl-connector linken (jouw bevestiging → `standard_connectors--connect`).
2. Bovenstaande code bouwen in één keer.
3. Kort testen tegen `/audio-diagnostics` of directe pipeline-invoke: "aanbiedingen wijn Albert Heijn" moet echte AH-hits geven; "recept voor pasta" mag géén webcall triggeren (log check op `needs_live_info=false`).
