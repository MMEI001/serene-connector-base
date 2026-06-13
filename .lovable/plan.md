## Doel

De Supabase-integratie gebruikt nu de oude `SUPABASE_SERVICE_ROLE_KEY` (gemarkeerd als deprecated). We schakelen over op de nieuwe sleutelstructuur (`sb_secret_...` / `sb_publishable_...`), zodat de Google Agenda-koppeling weer werkt.

## Wat er gebeurt

1. **Nieuwe secret toevoegen** — `SUPABASE_SECRET_KEY` (waarde begint met `sb_secret_...`). Dit vervangt `SUPABASE_SERVICE_ROLE_KEY` voor server-side admin-toegang.
   - In je Supabase Dashboard → **Project Settings → API Keys** kun je een nieuwe Secret Key aanmaken (of de bestaande kopiëren).
   - Je krijgt straks een veilig formulier om de waarde in te plakken.

2. **`src/integrations/supabase/client.server.ts` aanpassen** zodat de admin-client eerst `SUPABASE_SECRET_KEY` leest, met fallback naar `SUPABASE_SERVICE_ROLE_KEY` (zodat oude omgevingen niet breken). Foutmeldingen vermelden de nieuwe naam.

3. **Verifiëren** dat alle server-functies (o.a. `src/lib/google-calendar.functions.ts`, `saveGoogleTokens`, `fetchGoogleCalendars`, `disconnectGoogleCalendar`) via `supabaseAdmin` automatisch de nieuwe key gebruiken — geen extra wijzigingen nodig daar.

4. **Auth-middleware en browser-client blijven ongewijzigd** — die gebruiken de publishable key, die ook nog geldig is.

## Wat er niet verandert

- Geen database-migraties.
- Geen UI-wijzigingen.
- Geen wijzigingen aan de Google Agenda OAuth-flow zelf.

## Wat jij doet

- Bevestig dit plan.
- Daarna vraag ik je via een beveiligd formulier om de nieuwe `SUPABASE_SECRET_KEY` waarde (`sb_secret_...`) in te plakken.
- Na opslaan test je de Google Agenda-koppeling op `/agendas`.
