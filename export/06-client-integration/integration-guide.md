# Integratiegids — HoofdRust-assistent in een nieuwe React/Vite + TanStack Start + Supabase app

10 stappen tot een werkende assistent. Deze gids gaat ervan uit dat je een nieuwe Lovable- of eigen-hosted TanStack Start app hebt met Supabase-connectie.

---

## 1. Supabase project + auth

- Maak een nieuw Supabase-project. Kopieer `URL`, `publishable key`, `anon key`, `service_role key` naar je `.env` (zie `07-env/.env.example`).
- Zet Email auth aan. Optioneel: Google / Apple providers.
- Draai migratie: `psql <SUPABASE_DB_URL> -f 04-supabase/migrations/9999_full_schema_rebuild.sql`. Dit maakt alle tabellen, enums, policies en triggers aan.

## 2. Environment variables

Kopieer `07-env/.env.example` → `.env`. Vul in:
- Supabase-waarden (uit dashboard).
- `LOVABLE_API_KEY` (via Lovable of je eigen gateway-proxy).
- `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`.
- `FIRECRAWL_API_KEY` (optioneel — zonder deze werkt de assistent, alleen zonder `needs_live_info`-flow).

## 3. Edge Function `text-to-speech` deployen

```bash
supabase functions deploy text-to-speech --project-ref <your-ref>
supabase secrets set ELEVENLABS_API_KEY=... --project-ref <your-ref>
```

Bron: `04-supabase/edge-functions/text-to-speech/index.ts`. Draait in Deno; ondersteunt streaming + fallback-stem.

## 4. Server-code overzetten

Kopieer `05-server-code/` in je nieuwe app onder `src/lib/`, met deze structuur:

```
src/lib/
├── voice/                    ← uit 05-server-code/voice/
├── assistant/                ← uit 05-server-code/assistant/
├── tools/                    ← uit 05-server-code/tools/
├── voice-pipeline.functions.ts
├── voice-confirm.functions.ts
├── ai-classify.functions.ts
├── transcribe.functions.ts
├── daily-briefing.functions.ts
├── product-actions.functions.ts
├── brain-test.functions.ts
├── speak.ts
└── reminder-format.ts
```

De imports gebruiken `@/...` — zorg dat `tsconfig.json` een alias heeft:

```jsonc
"paths": { "@/*": ["./src/*"] }
```

## 5. Supabase client-integratie

Kopieer:
- `05-server-code/auth-middleware.ts` → `src/integrations/supabase/auth-middleware.ts`
- `05-server-code/supabase-client.ts` → `src/integrations/supabase/client.ts`

En maak zelf (project-standaard):
- `src/integrations/supabase/client.server.ts` — service-role admin client (zie `tanstack-supabase-integration` knowledge)
- `src/integrations/supabase/auth-attacher.ts` — bearer-token middleware voor server-fn calls

Registreer de auth-attacher in `src/start.ts`:

```typescript
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
```

## 6. Types genereren

```bash
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```

Nodig omdat alle server-code van `Database` type gebruik maakt.

## 7. Client-UI aansluiten

Referentie: `06-client-integration/reference-voice-orb.tsx`. Belangrijkste hooks:

```typescript
import { runVoicePipeline } from "@/lib/voice-pipeline.functions";
import { confirmVoiceAction, cancelVoiceAction, getPendingVoiceAction } from "@/lib/voice-confirm.functions";
import { transcribeAudio } from "@/lib/transcribe.functions";
```

Flow:
1. Neem audio op (MediaRecorder), stuur naar `transcribeAudio({ audio_base64 })`.
2. Roep `runVoicePipeline({ text, transcription_id, history })` aan.
3. Toon `result.assistant_reply`, speel TTS via `speak()` (uit `05-server-code/speak.ts`).
4. Bij `result.status === "needs_confirmation"` → toon bevestigingskaart met `getPendingVoiceAction()`, roep `confirmVoiceAction()` of `cancelVoiceAction()` aan.
5. Toon `result.products` als productkaarten (indien aanwezig).
6. Toon `result.experience_card` als speciale kaart (gift_event).

Bewaar chat-history client-side (max 6 turns, `{role, content}`), stuur die mee bij elke `runVoicePipeline` call.

## 8. Onboarding + persona

Voor de persona-laag zinvol wordt, moet `user_profiles` gevuld zijn. Maak een onboarding-flow die minstens deze velden vult:

- `primary_goal` (multi-select)
- `support_style` ("rustig en zacht" / "kort en duidelijk" / "meedenkend" / "zo min mogelijk")
- `overstimulation_level` ("nooit" / "soms" / "vaak" / "heel vaak")
- `suggestion_count_preference` ("eén tegelijk" / "twee of drie" / "maakt me niet uit")
- `preferred_help_area` (multi-select: "Reminders", "Plannen", "Loslaten", "Notities")
- `reminder_style` ("dag van tevoren" / "uur van tevoren" / "op de dag zelf")
- `planning_style` ("met buffer" / "strak" / "normaal")

Referentie: `voice/persona.ts` verwerkt exact deze velden.

## 9. Firecrawl connector (optioneel)

Zonder Firecrawl werkt de assistent volledig, alleen zonder "aanbiedingen/prijzen" flow. Om aan te zetten:

- Firecrawl account (https://firecrawl.dev).
- Sla API-key op als `FIRECRAWL_API_KEY` in server-env.
- `tools/web-search.server.ts` pikt hem automatisch op.

## 10. Smoke-tests

Test in deze volgorde tegen je nieuwe app:

1. **Simple reminder** — "Zet morgen 9 uur tandarts." → verwacht bevestigingskaart → bevestig → `appointments`-rij verschijnt.
2. **Note zonder confirm** — "Boodschap: melk en brood." → note direct opgeslagen.
3. **Agenda-query** — "Wat staat er morgen op mijn agenda?" → leest zonder LLM-call.
4. **Multi-intent (na spec-fix)** — "Zaterdag bezoek Ria en Piet, één dag ervoor bloemen kopen." → 2 acties, 1 bevestigingskaart.
5. **Missing datetime (na spec-fix)** — "Bel de dokter." → vraag "wanneer?" → vervolgtekst "vrijdag" → bevestigingskaart.
6. **Web-tak** — "Aanbiedingen wijn Albert Heijn." → productkaarten.
7. **Gift-event experience** — "Kinderfeestje voor Anne op 20 juli." → clarify (leeftijd?), dan cadeau-ideeën + reminder-voorstel.
8. **Memory** — "Mijn dochter houdt van paarden." → assistent vraagt: "Zal ik onthouden dat je dochter van paarden houdt?" → "ja" → next turn: context bevat "dochter van paarden".

## Beperkingen

- Google Calendar OAuth vergt eigen client_id/secret (Google Cloud project).
- ICS-sync draait via `src/routes/api/public/hooks/sync-ics.ts` — met een cron nodig (pg_cron of externe scheduler). Voorbeeld:
  ```sql
  select cron.schedule('ics-sync', '*/15 * * * *', $$
    select net.http_post('https://<host>/api/public/hooks/sync-ics', '{}', 'application/json')
  $$);
  ```
- De `assistant/pipeline.ts` framework en de legacy `voice-pipeline.functions.ts` draaien beide; zet `ASSISTANT_FRAMEWORK=on` in env om het framework te activeren voor `assistant_chat` intents.

## FIX-checklist (jouw wensen inbouwen)

Zie `03-behavior-rules/` — 8 documenten met per document exact welke prompt-regel of code-plek moet worden aangepast. Volgorde van uitrol:

1. `missing-datetime.md` — belangrijkste user-facing verbetering.
2. `multi-intent.md` — vaak voorkomend gebruikspatroon.
3. `confirmation.md` — hardening zodat niets stil wordt opgeslagen.
4. `location-and-shopping.md` — vergt nieuwe DB-tabel `reminder_attachments`.
5. `proactive-suggestions.md` — zet Initiative Engine uit.
6. `dutch-language.md` — TTS-uitspraak fix (helper + prompt-regel).
7. `agenda-overview.md` — ICS-events meenemen in query.
8. `intent-recognition.md` — geen wijziging nodig, referentie.

Elke fix is klein (1 prompt-block edit of 1 code-blok) en kan onafhankelijk worden uitgerold.
