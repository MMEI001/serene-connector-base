## Doel
Experience 001 (kinderfeestje) voelt nu correct, maar nog AI-achtig: ze gokt direct drie cadeau-ideeën zonder context op te halen, kan niet doorpraten in een tweede turn, en de TTS leest het lijstje voor in plaats van mee te denken. Sprint 5 verbetert die vier punten zonder de bestaande flow te breken.

## Stap 1 — Continuïteit (nieuwe `experience_state` tabel)

Een tweede turn als "het is een meisje van acht" moet de lopende Experience verder vullen, niet opnieuw starten. We persisteren per gebruiker één actieve Experience.

Migratie:
```text
voice_experience_state(
  user_id uuid PK references auth.users,
  kind text check (kind in ('gift_event')),
  data jsonb not null default '{}',
  asked_field text,            -- welk veld is laatst opgevraagd
  updated_at timestamptz,
  expires_at timestamptz       -- 15 min sliding window
)
```
+ GRANT SELECT/INSERT/UPDATE/DELETE aan `authenticated`, ALL aan `service_role`, RLS-policies per `auth.uid()`.

## Stap 2 — Conversation Engine herkent continuatie

In `conversation-engine.ts` voor de classifier-call:
1. Laad actieve experience-state (niet vervallen).
2. Als die bestaat én de utterance lijkt op aanvullende info (korte zin, bevat leeftijd/getal, "meisje/jongen", "budget", "houdt van …", "interesse", of de Engine herkent `asked_field`-keyword), sla Gemini over en bouw zelf een `assistant_chat`-actie met `experience=gift_event` en gemergede `experience_data`.
3. Anders: normale classify; als het resultaat een nieuwe `gift_event` is, vervang state; bij iets totaal anders, expire de oude state.

Het mergen gebeurt server-side in een nieuw klein bestand `src/lib/assistant/experiences/continuation.ts` met pure helpers (`mergeGiftData`, `looksLikeContinuation`, `extractFieldsFromUtterance`) zodat het testbaar blijft.

## Stap 3 — Adaptieve vragen in gift-event

`runGiftEvent` krijgt een nieuwe pre-stap:
1. Bepaal `missingFields` uit `age`, `interests`, `budget` met een prioriteit (age → interests → budget). `who` en `iso_datetime` blijven verplicht voor het reminder-voorstel maar worden niet meer "gevraagd" — slimme defaults blijven.
2. Als er minstens één essentieel veld mist én er nog géén clarificatie is gesteld voor dit veld (kijk in state.asked_field), retourneer een nieuwe outcome-mode:
   ```text
   { kind: "clarify", askField, question, spokenSummary }
   ```
   Bijvoorbeeld `askField="age"` → `question="Hoe oud wordt ze?"`, `spokenSummary="Leuk! Hoe oud wordt ze? Dan kan ik je een paar passende cadeau-ideeën geven."`
3. Schrijf state weg met `asked_field=age` en gemergede data.
4. Als alle gewenste velden ingevuld zijn (of we hebben al één keer doorgevraagd) → genereer ideeën zoals nu en wis de state.

In de pipeline (`pipeline.ts`) krijgt de clarify-tak een eigen pad:
- Geen reminder-proposal, geen DB-actie.
- `experience_card` wordt een lichte variant `kind: "gift_event_clarify"` met de vraag.
- `result.status = "completed"`, `assistant_reply = question`, `spoken_summary = spokenSummary`.

`ExperienceCard` UI krijgt een tweede render-tak voor `gift_event_clarify` (alleen tekst — geen ideeën, geen knoppen).

## Stap 4 — Persoonlijkere cadeau-ideeën

`generateIdeas`:
- Krijgt `persona` mee en (indien aanwezig) `memoryHits` voor latere uitbreiding.
- Prompt wordt aangevuld met persona-stijl ("rustig", "gestructureerd") en eventuele eerdere notitie-keys (privacy: alleen sleutel/categorie, nooit ruwe waarden uit memoryHits).
- Default-ideeën vertakken op leeftijdsbanden (0–3, 4–7, 8–11, 12+) i.p.v. één algemene 6–8-default.
- Bij gemengde of onbekende interesses: gebruik een licht-veiligere prompt ("vermijd lawaaiig speelgoed als ouder rust waardeert").

## Stap 5 — Natuurlijker gesproken samenvatting

`buildSpokenSummary` wordt herschreven:
- Random uit ~4 openers ("Leuk", "Wat lief", "Mooi", "Goed dat je het noemt") — deterministisch op `user_id`+`turn_id` zodat dezelfde turn altijd dezelfde regel geeft.
- Combineert ideeën als zinsdeel, niet als opsomming met `, of`: "Ik dacht aan een knutselset, iets om mee te bouwen, of een mooi prentenboek."
- Vervolgzin verwijst naar geleverde context als die er is ("voor een meisje van acht"): "Zal ik je vrijdag om negen uur herinneren om iets voor haar uit te kiezen?"
- Bij clarify: korte rustige vraag, geen "Ik denk met je mee"-prefix.
- Cijfers worden uitgeschreven in TTS-vriendelijk Nederlands (09:00 → "negen uur", 8 → "acht").

## Stap 6 — EngineTrace uitbreiding

In `types.ts` wordt `experience` uitgebreid (privacy-veilig — alleen enums/tellingen):
```ts
experience?: {
  kind: "gift_event";
  had_existing_event: boolean;
  had_existing_reminder: boolean;
  ideas_count: number;
  mode: "ideas" | "clarify";
  missing_fields: Array<"age" | "interests" | "budget">;
  asked_field: "age" | "interests" | "budget" | null;
  continuation_used: boolean;
  state_age_ms: number | null;
  ms: number;
};
```

Nieuwe `OpportunityReason`-enum-waarde `needs_clarification` voor de Initiative Engine zodat de Decision Engine geen DB-actie doorlaat zolang de clarify-tak loopt.

Het debug-paneel (`engine-trace-panel.tsx`) toont deze extra chips.

## Niet-doelen
- Geen wijzigingen aan andere Experiences (er is er maar één).
- Geen wijzigingen aan auth, agenda, reminders-schema.
- Geen voicechange — alleen samenvatting-tekst.
- Geen multi-experience state (één actieve per user volstaat).

## Technische details
- Continuation-window: 15 minuten sliding (`updated_at + 15m`). Bij commit/cancel van een reminder-voorstel uit dezelfde experience, wis state direct.
- Max één clarify-ronde per Experience — daarna doorgaan met defaults, anders blijven we vragen stellen.
- Pipeline-tak voor clarify schrijft géén `voice_actions`-rij; alleen `voice_intents` audit-log met `engine_trace.experience.mode = "clarify"`.
- State-tabel is auth-only (geen `anon` grant); reads/writes uitsluitend via `requireSupabaseAuth`-server-functions (geen edge cron).
- Random-opener wordt seeded met een hash van `user_id|turn_id` (geen `Math.random` aan server-zijde voor reproduceerbare debug-runs).

## Bestanden
- migratie: `supabase/migrations/<ts>_voice_experience_state.sql`
- nieuw: `src/lib/assistant/experiences/continuation.ts`
- nieuw: `src/lib/assistant/experiences/spoken-summary.ts` (uit gift-event gehaald, herschreven)
- update: `src/lib/assistant/experiences/gift-event.ts` (clarify-modus, persona-prompt, lees/schrijf state)
- update: `src/lib/assistant/conversation-engine.ts` (continuation-detectie)
- update: `src/lib/assistant/pipeline.ts` (clarify-tak, trace)
- update: `src/lib/assistant/types.ts` (trace + reason)
- update: `src/lib/assistant/initiative-engine.ts` (`needs_clarification` reason → score 0)
- update: `src/components/experience-card.tsx` (`gift_event_clarify` variant)
- update: `src/components/debug/engine-trace-panel.tsx` (nieuwe chips)
- update: `src/integrations/supabase/types.ts` (gegenereerd na migratie)
