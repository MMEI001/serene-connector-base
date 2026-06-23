## Root cause

`loadPrefs()` in `src/lib/speak.ts` cached **`false`** voor de hele sessie en gebruikt dat daarna onvoorwaardelijk.

Twee paden waarlangs een onterechte `false` in de cache komt:

1. **`supabase.auth.getUser()` faalt met 403** (precies wat je in het netwerk ziet op `/auth/v1/user`). `getUser()` doet een netwerkcall en valideert het token server-side; bij een tijdelijke 403 / refresh-race retourneert dit `user = null`. De huidige code doet dan:
   ```ts
   if (!user) return { enabled: false, ... }
   ```
   Daarna wordt deze waarde **niet** gecached (terecht), maar bij de andere tak (`maybeSingle()` geeft `data = null` door bv. een latente RLS-race of een lege response):
   ```ts
   const enabled = Boolean(row?.voice_enabled);
   cachedEnabled = enabled;  // ← false wordt voor de hele sessie vastgezet
   ```
   Vanaf dat moment retourneert `loadPrefs()` altijd `false`, ook als de DB intussen `true` zegt en het profiel correct laadt.

2. **`speakText` draait vóór de profielroute** (jij zit nu op `/laat-los`, niet `/profiel`). Alleen `profiel.tsx` roept `setVoicePreferenceCache(true)` aan na het ophalen van het profiel. Op andere routes vult de eerste `loadPrefs()`-call de cache met wat de eerste poging ook teruggeeft — als die poging samenvalt met de 403, blijft `false` plakken.

DB-check bevestigd: er is **1** rij voor jouw `user_id` met `voice_enabled = true`. Geen duplicaten, geen RLS-probleem op de tabel zelf. Het probleem zit volledig in de client-side prefs-loader.

## Plan

Alleen `src/lib/speak.ts` aanpassen — kleine, gerichte wijziging, geen nieuwe bestanden.

### 1. Vervang `getUser()` door `getSession()` in `loadPrefs`
`getSession()` is lokaal (geen netwerk, geen 403). De `user_profiles`-query gebruikt al RLS via de session; we hebben geen server-side user-revalidatie nodig voor het ophalen van een UI-voorkeur.

### 2. Cache alleen bij een echt geslaagde load
- Geen session → return default (`enabled:false`), **niet cachen**.
- Query error → log + return default, **niet cachen**.
- `data === null` (geen rij gevonden) → log + return default, **niet cachen** (laat een latere call het opnieuw proberen zodra het profiel er is).
- Alleen bij een succesvolle response met een rij: `cachedEnabled = row.voice_enabled` opslaan.

### 3. Uitgebreide logging in `prefs_loaded`
Voeg toe aan het bestaande `prefs_loaded` event én een nieuw `prefs_load_failed` event:
- `user_id`
- `profile_id` (de `id` kolom van `user_profiles`)
- `voice_enabled_db` (ruwe waarde uit DB, kan `null` zijn)
- `voice_enabled_effective` (wat `speak.ts` daadwerkelijk gebruikt)
- `source`: `"cache" | "db" | "default_no_session" | "default_no_row" | "default_query_error"`
- bij error: `error_message`, `error_code`

Selecteer dus ook `id` in de query.

### 4. Auth-state listener die de cache leeggooit
Eenmalig bij module-load een `supabase.auth.onAuthStateChange` registreren die `resetVoicePreferenceCache()` aanroept bij `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED` en `USER_UPDATED`. Voorkomt dat een stale `false` blijft hangen na een token-refresh die de 403 oploste.

### 5. `skipped_disabled`-log uitbreiden
Zodat we direct zien waarom geskipt werd: `{ intent, voice_enabled, source }`.

### Niet in scope
- Edge function, retry/fallback in `playWithRetry`, andere providers — die werken al.
- Profielroute (`profiel.tsx`) — die zet de cache al correct na load, blijft ongewijzigd.
- DB / RLS-wijzigingen — niet nodig, data is correct.

### Verificatie
1. Hard refresh op `/laat-los`, voice-action triggeren → console moet tonen:
   `prefs_loaded { source:"db", voice_enabled_db:true, voice_enabled_effective:true, user_id, profile_id }` en daarna `tts_request_started`.
2. Console-trick: `await (await import('/src/lib/speak.ts')).resetVoicePreferenceCache()` simuleren door manueel auth-event te triggeren → volgende call laadt opnieuw uit DB.
3. Forceer de 403-situatie door even offline te gaan tijdens de eerste call → log moet `prefs_load_failed` tonen en bij de volgende poging opnieuw proberen (niet permanent `false` cachen).
