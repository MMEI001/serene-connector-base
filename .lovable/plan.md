# Plan: gebruik signInWithOAuth voor Google Calendar-koppeling

## Doel
`handleConnect` in `src/routes/agendas.index.tsx` koppelen via `supabase.auth.signInWithOAuth` (in plaats van `linkIdentity`), met behoud van scope `calendar.readonly`, `access_type: 'offline'` en `prompt: 'consent'`. Het Google `refresh_token` wordt in de callback opgeslagen, gekoppeld aan de huidige `user_id`.

## Wijzigingen

### 1. `src/routes/agendas.index.tsx` — `handleConnect`
Vervang het `linkIdentity`-blok door:

```ts
const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    scopes: "https://www.googleapis.com/auth/calendar.readonly",
    redirectTo,
    queryParams: { access_type: "offline", prompt: "consent" },
  },
});
```

Error-handling, logging en `setConnecting(false)` blijven gelijk (alleen labels van `linkIdentity` → `signInWithOAuth`).

### 2. `src/routes/agendas.callback.tsx` — geen functionele wijziging
De callback luistert al op `onAuthStateChange` + `getSession`, leest `provider_token` / `provider_refresh_token` uit de sessie en roept `saveGoogleTokens` aan. Die serverFn draait onder `requireSupabaseAuth` en schrijft naar `calendar_connections` met `context.userId` — dus het refresh_token wordt automatisch gekoppeld aan de huidige (na callback ingelogde) user.

Geen wijziging nodig, behalve eventueel de warning-tekst aanpassen.

## Belangrijke caveat (graag bevestigen)
`signInWithOAuth` start een volwaardige sign-in flow, geen identity-link. Concreet:

- Als de gebruiker oorspronkelijk **met Google** is ingelogd met hetzelfde Google-account → zelfde `user.id`, alles werkt en het refresh_token landt bij dezelfde user. Dit is de happy path.
- Als de gebruiker is ingelogd met **email/wachtwoord of een ander Google-account** → de callback logt hem in als de Google-user. Afhankelijk van Supabase-instellingen wordt dit ofwel dezelfde user (bij matchende e-mail en "link accounts with same email" aan), ofwel een **nieuwe user** waardoor het refresh_token bij de verkeerde `user_id` belandt en het oorspronkelijke account effectief wordt vervangen.

Dit is precies waarom `linkIdentity` bestaat. De reden om over te stappen is dat `linkIdentity` momenteel geen `provider_refresh_token` teruggeeft in de callback (`hasRefresh: false`). `signInWithOAuth` lost dat op, maar introduceert bovenstaand identity-risico.

## Te bevestigen vóór implementatie
1. Akkoord met overstap naar `signInWithOAuth` met de bovenstaande caveat?
2. Is de primaire login-methode in deze app **alleen Google**? (Zo ja: caveat is in de praktijk geen probleem.)
