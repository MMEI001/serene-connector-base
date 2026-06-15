Review of `src/routes/agendas.index.tsx`
- The `handleConnect` function already passes an `options` object to `supabase.auth.linkIdentity`.
- It already requests the Google Calendar read-only scope: `https://www.googleapis.com/auth/calendar.readonly`.
- It already includes `queryParams: { access_type: "offline", prompt: "consent" }`, which is the required combination to obtain a refresh token from Google.
- It already sets the `redirectTo` to `/agendas/callback`.

User decision after clarification: keep the read-only scope. Therefore no code change is required to satisfy the request.

If the user later decides they need full read/write calendar access, the only required change is to replace the scope string with `https://www.googleapis.com/auth/calendar` while keeping the same `queryParams` and `redirectTo`.