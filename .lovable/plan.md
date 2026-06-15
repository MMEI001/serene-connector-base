# ICS-agenda's koppelen (Apple iCloud e.d.)

Doel: gebruikers kunnen één of meer ICS-feeds koppelen (webcal:// of https://), die periodiek synchroniseren, en de events tonen samen met Google Calendar events in de bestaande agenda-view.

## 1. Database migratie

Twee nieuwe tabellen in `public`:

**`ics_calendars`**
- `id` uuid pk
- `user_id` uuid (FK auth.users, cascade)
- `name` text
- `url` text (genormaliseerd naar https://)
- `color` text nullable (voor latere kleur-config)
- `last_synced_at` timestamptz nullable
- `last_error` text nullable
- `created_at`, `updated_at` timestamptz

**`ics_events`**
- `id` uuid pk
- `calendar_id` uuid (FK ics_calendars, cascade)
- `uid` text (uit ICS)
- `summary` text
- `description` text nullable
- `location` text nullable
- `start_time` timestamptz
- `end_time` timestamptz nullable
- `is_all_day` boolean default false
- `updated_at` timestamptz
- UNIQUE (calendar_id, uid)
- index op (calendar_id, start_time)

RLS: gebruiker ziet/bewerkt alleen eigen rijen. Voor `ics_events` via subquery op `ics_calendars.user_id`. GRANT op beide aan `authenticated` + `service_role`.

Trigger `set_updated_at` op beide.

## 2. Server functions (`src/lib/ics-calendar.functions.ts`)

Allemaal met `requireSupabaseAuth`:
- `listIcsCalendars()` → calendars van huidige user
- `addIcsCalendar({ name, url })` → normaliseer webcal:// → https://, valideer met fetch+parse (min. 1 VEVENT), insert, trigger initial `syncIcsCalendar`, return rij
- `deleteIcsCalendar({ id })`
- `syncIcsCalendar({ id })` → fetch URL, parse met `node-ical`, upsert events op (calendar_id, uid), delete events met uids die niet meer voorkomen, update `last_synced_at` of `last_error`, return `{ count, syncedAt }`
- `syncAllIcsCalendars()` → loop over user's calendars, vang per-calendar errors af, return per-id status
- `listIcsEventsInRange({ from, to })` → events van alle eigen calendars binnen window, join met calendar-naam/kleur

`node-ical` toevoegen via `bun add node-ical`. Parsing alleen in server-functions (server-side runtime).

## 3. UI — `src/routes/agendas.index.tsx`

Nieuwe sectie onder Google-blok: **"Andere agenda's (ICS)"**
- Form: input `name`, input `url`, knop "Toevoegen" (loading state, toont fout bij ongeldige feed)
- Lijst van ICS-calendars: naam, "Laatst gesynchroniseerd" (relatief), aantal events (uit count query), eventueel `last_error` rood, "Nu syncen" knop, prullenbak

State los van Google-state zodat fouten/ontkoppelen elkaar niet blokkeren.

## 4. Agenda-view integratie — `src/routes/agenda.index.tsx`

Huidige view toont alleen `appointments`. Uitbreiding:
- Naast `appointments` ook ICS-events ophalen (komende ~90 dagen) via `listIcsEventsInRange`
- Optioneel ook Google-events (laten we voorlopig buiten scope houden tenzij al aanwezig — als bestaande view alleen `appointments` toont, voegen we ICS toe; Google-events visualisatie is eerder werk en valt buiten deze taak)
- Unified type `DisplayEvent { id, source: 'appointment' | 'ics', sourceLabel, color, title, startDate, startTime, endTime }`
- Mergen en sorteren per dag op start tijd
- Per kaart een kleine badge rechtsboven met `sourceLabel` (bv. "Werk", "Privé"); kleurpunt links via `color`
- Default kleuren per ICS-calendar uit `color` of fallback uit hash van naam

## 5. Achtergrond-sync bij app-open

In `src/routes/__root.tsx` (of een client-only effect daar): zodra `user` ingelogd, fire-and-forget `syncAllIcsCalendars()` zonder UI te blokkeren; bij succes invalidate van router/queries niet nodig — de agenda-view laadt opnieuw bij navigatie.

## 6. Hourly cron

Server route `src/routes/api/public/hooks/sync-ics.ts` (POST):
- Geen user-context; gebruikt `supabaseAdmin` (binnen handler import)
- Lijst alle `ics_calendars`
- Voor elk: zelfde sync-logica als `syncIcsCalendar`, error per kalender afvangen
- Auth via `apikey` header (Supabase anon key) — `/api/public/*` bypasst auth op published site, en de logic doet geen privileged write namens user

Daarna via `supabase--insert` tool: `cron.schedule('sync-ics-hourly', '0 * * * *', ...)` met `net.http_post` naar `https://project--aa2817e3-a301-4a75-9e08-9af6a4d4d4e1.lovable.app/api/public/hooks/sync-ics`.

## Volgorde van implementatie

1. Migratie (tabellen + RLS + grants + triggers)
2. `bun add node-ical`
3. Server functions
4. UI in `agendas.index.tsx`
5. Agenda-view merge
6. Background sync hook in `__root.tsx`
7. Cron route + `cron.schedule`

## Technische notities

- `webcal://` → `https://` enkel voor fetch en opslag; we slaan de https-versie op zodat cron eenvoudig werkt
- Validatie van URL: protocol whitelist `webcal:`, `https:`, optioneel `http:`. Max length 2000.
- Naam: trim, 1–100 chars.
- `node-ical` werkt in workerd-runtime mits geen filesystem-deps; gebruik `ical.async.parseICS(text)` op gefetchte body i.p.v. `fromURL`.
- Soft-fail: één corrupte feed mag nooit de sync van andere blokkeren.
- Geen kleur-picker UI in deze ronde — alleen kolom alvast voorbereiden.

## Out of scope

- Google Calendar events in unified view (alleen ICS + appointments nu, tenzij triviaal toe te voegen)
- Kleur-picker per ICS-agenda (kolom bestaat, UI later)
- Two-way sync; alles is read-only
