## Doel
"Koppelen lukte niet" wordt op twee plekken getoond zonder dat de onderliggende oorzaak zichtbaar is. Ik breid beide locaties uit zodat de echte error in de browser-console verschijnt en je de root cause kunt zien.

## Wijzigingen

### 1. `src/routes/agendas.index.tsx` (handleConnect, ±r70-85)
Bij `supabase.auth.linkIdentity` returnt Supabase een error-object in plaats van te throwen. Toevoegen:
- `console.error("Google Calendar linkIdentity failed:", linkErr);` vóór de toast.
- Extra try/catch om de hele aanroep heen, zodat ook een onverwachte throw (netwerk, redirect-config) gelogd wordt in plaats van stil te falen.
- De toast-tekst krijgt optioneel `linkErr.message` mee (bv. `toast.error(\`Koppelen lukte niet: ${linkErr.message}\`)`) zodat het ook zichtbaar is zonder devtools.

### 2. `src/routes/agendas.callback.tsx` (persist, ±r31-43)
De huidige `catch {}` slikt de error van `saveGoogleTokens`. Wijzigen naar:
- `catch (err) { console.error("saveGoogleTokens failed:", err); ... }`
- Indien `err instanceof Error`, de `err.message` ook in `setMessage` tonen, zodat de UI ("error"-state) de echte oorzaak laat zien.

### 3. (optioneel) extra signaal in de callback
Op r29 wordt stil teruggekeerd als `providerToken` ontbreekt. Toevoegen:
- `console.warn("Callback session zonder provider_token", { hasSession: !!session, hasRefresh: !!providerRefreshToken });`
Dit helpt onderscheiden tussen "Google gaf geen token terug" en "saveGoogleTokens faalde".

## Geen wijzigingen aan
- Server function `saveGoogleTokens` zelf (logging hoort daar via `server-function-logs`, maar je vraag gaat om de console).
- UI/styling van de twee pagina's.

## Hoe je daarna debugt
1. Probeer opnieuw te koppelen met devtools-console open.
2. Bekijk de regel beginnend met `Google Calendar linkIdentity failed:` of `saveGoogleTokens failed:`.
3. Stuur mij die error door als de oorzaak niet duidelijk is — dan kunnen we gericht fixen (bv. ontbrekende redirect URL in Supabase Auth, of een server-fn validatiefout).