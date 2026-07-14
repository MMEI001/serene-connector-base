# HoofdRust Assistent — Overdraagbaar Pakket

Dit pakket bevat **alle intelligentie** van de HoofdRust-assistent, klaar om te droppen in een nieuwe React/Vite + TanStack Start + Supabase app. Geen bestaande code van dit project is aangeraakt; alles hieronder is een export.

## Inhoud

| Map | Wat het bevat |
| --- | --- |
| `01-overview/` | Architectuur, dataflow, en per regel: komt uit code, prompt of aanname |
| `02-prompts/` | Letterlijke system prompts + JSON-tool-schema van de Brain |
| `03-behavior-rules/` | Gedragsregels per onderwerp, elk gelabeld `[code]` / `[prompt]` / `[aanname]` / `[FIX-spec]` |
| `04-supabase/` | Bestaande migraties (kopie), plus één nieuwe schone recreate-migratie in `migrations/9999_full_schema_rebuild.sql`, en de Edge Function `text-to-speech` |
| `05-server-code/` | 1-op-1 kopie van alle server-side intelligentie (`voice/`, `assistant/`, `tools/`, server-fn wrappers) — paden onveranderd (`@/...`) |
| `06-client-integration/` | Referentie-`voice-orb.tsx` + integratiegids |
| `07-env/` | Volledige lijst environment variables — géén waarden |

## Waar te beginnen

1. Lees `01-overview/architecture.md` — één pagina om het mentale model te vormen.
2. Lees `03-behavior-rules/*.md` — de acht gedragsdocumenten. Elke FIX die jij hebt opgegeven staat expliciet gemarkeerd.
3. Volg `06-client-integration/integration-guide.md` — 10 stappen tot werkende assistent.

## Wat er **niet** in zit

- Geen geheime API-keys (LOVABLE_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, FIRECRAWL_API_KEY, GOOGLE_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY).
- Geen UI-styling of decoratieve componenten (breathing-orb, time-aware-background). Alleen een minimale referentie-orb.
- Geen persoonlijke data uit de huidige database.

## Bron-project

- Lovable project ID: `aa2817e3-a301-4a75-9e08-9af6a4d4d4e1`
- Supabase project ref: `ysapwakidfaxtczlxanu`
- Peildatum export: 2026-07-14
