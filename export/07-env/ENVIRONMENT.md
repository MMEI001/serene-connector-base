# Environment Variables

Volledig overzicht van alle env-vars die de assistent gebruikt. **Geen** waarden. Namen zijn hoofdlettergevoelig.

## Server-side (process.env — nooit blootstellen aan client)

| Naam | Verplicht | Waar gebruikt (code) | Waarvoor |
| --- | --- | --- | --- |
| `LOVABLE_API_KEY` | ja | `voice/process-voice-input.ts:481`, `tools/web-synth.server.ts:94`, `assistant/experiences/gift-event.ts:102`, `ai-classify.functions.ts:78`, `analyze-screenshot.functions.ts:104` | Alle LLM-calls via Lovable AI Gateway |
| `OPENAI_API_KEY` | ja (als STT-provider = openai) | `voice/providers/openai.ts:10` | Whisper STT |
| `ELEVENLABS_API_KEY` | ja | Edge function `text-to-speech` (Deno.env) | TTS |
| `FIRECRAWL_API_KEY` | alleen als web-tak actief | `tools/web-search.server.ts:131` | Web-search voor prijzen/aanbiedingen |
| `SPEECH_PROVIDER` | nee | `voice/providers/index.ts:13` | Kies STT-provider: `openai` (default), `google`, `deepgram` |
| `GOOGLE_CLIENT_ID` | alleen bij Google Calendar sync | `google-calendar.functions.ts:55` | OAuth flow |
| `GOOGLE_CLIENT_SECRET` | alleen bij Google Calendar sync | `google-calendar.functions.ts:56` | OAuth flow |
| `ASSISTANT_FRAMEWORK` | nee | `assistant/flags.ts:17` | `on` / `off` / `shadow` — schakelt framework in of laat legacy pipeline draaien |
| `NODE_ENV` | auto | `config.server.ts:21` | Standaard Node var |

## Supabase (server-side leest process.env)

| Naam | Verplicht | Waar gebruikt |
| --- | --- | --- |
| `SUPABASE_URL` | ja | `integrations/supabase/auth-middleware.ts:12`, `client.server.ts:9`, edge function |
| `SUPABASE_PUBLISHABLE_KEY` | ja | `auth-middleware.ts:13` — publishable key, RLS-actief |
| `SERVICE_ROLE_KEY` (of `SUPABASE_SERVICE_ROLE_KEY`) | ja | `client.server.ts:10` — voor admin-taken zoals ICS-sync |
| `SUPABASE_ANON_KEY` | alleen edge function fallback | `text-to-speech/index.ts:108` |

## Client-side (import.meta.env — publiek zichtbaar)

| Naam | Verplicht | Waar gebruikt |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ja | `integrations/supabase/client.ts:8`, `voice/voice-service.ts:266`, `audio-diagnostics.tsx:184` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ja | `client.ts:9`, `voice-service.ts:269` |
| `VITE_SUPABASE_ANON_KEY` | fallback | `voice-service.ts:270` |
| `VITE_SUPABASE_PROJECT_ID` | optioneel | tooling / URL-generatie |

## `[alleen-Lovable]` — nu alleen in Lovable-secrets, niet in .env

- `LOVABLE_API_KEY` (auto-geprovisioneerd door Lovable AI Gateway — moet handmatig gezet worden op nieuwe hosts)
- `SUPABASE_JWKS` (Lovable-eigen validatie, niet nodig op andere stacks)
- `SUPABASE_DB_URL` (alleen voor Lovable-managed migraties)

## Beveiliging

- **Nooit** een key met `SECRET`, `PRIVATE` of `SERVICE_ROLE` in de `VITE_*` naamruimte zetten — die wordt in de browser bundle mee-gebundeld.
- Publishable/anon key mag wel client-side; RLS beschermt de data.
- Service role bypass RLS — alleen server-side gebruiken, alleen in `.server.ts` en edge functions.
