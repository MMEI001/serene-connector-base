
# Overdrachtspakket HoofdRust-assistent → /export/

Doel: alle intelligentie (prompts, regels, geheugen, schema, server-code) veilig overdraagbaar maken naar een andere React/Vite + TanStack Start + Supabase app, met gemarkeerde fixes voor jouw gewenste gedrag. Ik verander **niets** aan de bestaande app; alle output landt in een nieuwe map `/export/`.

## Wat je krijgt

Alles onder `/export/` in het huidige project, opgedeeld in vier lagen:

```text
/export/
  README.md                       ← startpunt + integratiestappen
  01-overview/
    architecture.md               ← lagen: Brain → Conversation → Memory → Decision → Execution
    data-flow.md                  ← voice → transcribe → pipeline → actions → UI
    code-vs-assumption.md         ← per regel: "uit code" / "uit prompt" / "aanname"
  02-prompts/
    brain-system-prompt.md        ← volledige process-voice-input prompt (letterlijk)
    classify-system-prompt.md     ← ai-classify prompt (letterlijk)
    web-synth-prompt.md           ← tweede-brain-call voor live info
    memory-classifier-rules.md    ← keyword-heuristics (uit code, geen prompt)
    experiences/gift-event.md     ← continuation/state-store gedrag
  03-behavior-rules/
    intent-recognition.md         ← agenda / reminder / notitie / laat-los / query / chat / event
    multi-intent.md               ← meerdere acties per zin (actions[])
    missing-datetime.md           ← ontbrekende datum = vragen, nooit verzinnen
    confirmation.md               ← voice-confirm flow + wanneer wel/niet
    location-and-shopping.md      ← locatievraag = notitie bij reminder, niet automatisch boodschappenlijst
    proactive-suggestions.md      ← initiative-engine gedrag + wanneer stil blijven
    dutch-language.md             ← "10 uur" i.p.v. "de tien uur", speak.ts regels
    agenda-overview.md            ← volledige, datum-correcte lijstlogica
  04-supabase/
    migrations/
      0001_profiles_and_user_profiles.sql
      0002_ai_suggestions.sql
      0003_appointments_reminders_notes_letgo.sql
      0004_assistant_memory.sql
      0005_voice_actions_intents_transcriptions_errors.sql
      0006_voice_experience_state.sql
      0007_calendar_ics.sql
      0008_user_behavior_events.sql
      0009_triggers_set_updated_at.sql
      0010_grants_and_rls.sql
    edge-functions/
      text-to-speech/index.ts     ← 1-op-1 kopie van bestaande Deno-functie
    policies-summary.md           ← per tabel: wie mag wat, in gewone taal
  05-server-code/                 ← alle server-fn's / server-only helpers, self-contained
    ai-gateway.server.ts
    voice/
      process-voice-input.ts
      persona.ts
      load-persona.ts
      handlers/*.ts
      providers/{openai,google,deepgram}.ts
    assistant/
      pipeline.ts
      conversation-engine.ts
      context-engine.ts
      context-summary.ts
      decision-engine.ts
      execution-engine.ts
      memory-engine.ts
      memory/{classifier,future-value,store,types}.ts
      experiences/{continuation,gift-event,spoken-summary,state-store}.ts
      initiative-engine.ts
      suggestion-engine.ts
    tools/{web-search,web-synth}.server.ts
    functions/
      voice-pipeline.functions.ts
      voice-confirm.functions.ts
      ai-classify.functions.ts
      transcribe.functions.ts
      daily-briefing.functions.ts
      product-actions.functions.ts
      brain-test.functions.ts
    speak.ts
    reminder-format.ts
  06-client-integration/
    minimal-voice-orb.tsx         ← afgeslankte referentie-UI-component
    hooks/use-voice-pipeline.ts
    integration-guide.md          ← 10 stappen: env → schema → server → client
  07-env/
    ENVIRONMENT.md                ← lijst van alle vars, waar ze worden gelezen, welke server-only
    .env.example                  ← lege template, géén waarden

```

## Aanpak

1. **Onderzoek** (loopt nu via subagent): alle prompts, regels, tabellen, policies, env-refs, edge functions verzamelen met file:line.
2. **Extract**: prompts letterlijk kopiëren naar `02-prompts/`. Regels in `03-behavior-rules/` splitsen per onderwerp; bij elke regel label `[code]`, `[prompt]` of `[aanname]`.
3. **SQL rebuild**: current schema uitlezen (kolommen, RLS, triggers, grants) en herschrijven als schone, geordende migraties (elke `CREATE TABLE public.*` gevolgd door `GRANT` + `ALTER TABLE ... ENABLE RLS` + `CREATE POLICY`, volgens de projectstandaard).
4. **Server-code kopiëren** naar `05-server-code/` met alleen relatieve interne imports, zodat de map los overplaatsbaar is. Externe imports (`@/integrations/supabase/*`, `@/lib/*`) worden herschreven naar relatieve paden binnen `/export/`.
5. **Fixes-laag** bovenop de kopie (elk gemarkeerd `// FIX (spec):`):
   - **Multi-intent**: prompt-uitbreiding + voorbeelden ("zaterdag bezoek Ria en Piet, één dag ervoor bloemen kopen" → 2 acties) en pipeline-check dat alle `actions[]` worden uitgevoerd, niet alleen `primary`.
   - **Ontbrekende datum**: strikte regel — bij `proposed_date=null` op appointment/reminder → **niet opslaan**, in plaats daarvan clarify-question stellen; context bewaren in `voice_experience_state` als nieuw `pending_datetime`-kind.
   - **Ontbrekende tijd**: idem, maar alleen naar tijd vragen als datum al bekend is.
   - **Locatievraag**: nieuwe intent-regel — "waar koop ik X" → default = suggestie/notitie gekoppeld aan de laatst-genoemde reminder (via `voice_experience_state`), niet als losstaande boodschappen-note.
   - **Bevestigingsstap**: harde regel dat elke appointment/reminder eerst via `voice-confirm.functions.ts` gaat; nooit stille insert. Voor `note`/`let_go` blijft direct opslaan (huidig gedrag).
   - **Geen ongevraagde suggesties**: `initiative-engine` krijgt strikte gate: alleen actief bij expliciete triggers (daily-briefing, expliciete vraag). System-prompt: "Geef geen suggesties tenzij de gebruiker erom vraagt."
   - **Titel ≠ letterlijke transcript**: prompt-regel + voorbeelden dat Brain een korte, semantische titel maakt.
   - **Agenda-overzicht**: query in handler `query.ts` uitbreiden zodat álle bronnen (appointments + ics_events) worden samengevoegd en op datum gesorteerd; datumformat expliciet `dd MMMM yyyy` NL-locale.
   - **Nederlandse tijden**: `speak.ts` krijgt `formatDutchTime()` — "10 uur", "half elf", "kwart over twee", nooit "de X uur"; unit-test-voorbeelden in comment.
6. **Env-inventaris** (`07-env/`): alle `process.env.*` en `import.meta.env.VITE_*` refs uit de code, met per var: server-only vs client, verplicht vs optioneel, waar in code, en of hij nu alleen in Lovable-secrets staat (dan `[alleen-Lovable]` label). Nooit waarden.
7. **Integratiegids** (`06-client-integration/integration-guide.md`): 10 stappen — Supabase project maken → migraties draaien → auth aanzetten → env invullen → server-code drop-in → `attachSupabaseAuth` middleware → client hook aansluiten → text-to-speech edge function deployen → optioneel Firecrawl connector → smoke-test scenario's.
8. **QA-pass**: na schrijven controleer ik zelf dat elke prompt letterlijk overeenkomt met bron (diff), dat elke tabel in migraties matcht met `information_schema`, en dat elke env-var minstens één code-referentie heeft.

## Wat expliciet **niet** in dit pakket zit

- Geen geheime waarden (LOVABLE_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, FIRECRAWL_API_KEY, GOOGLE_CLIENT_SECRET, service_role).
- Geen UI-styling / breathing-orb / time-aware-background (dat is presentatie, niet intelligentie) — alleen een minimale referentie-component om te bewijzen dat de hook werkt.
- Geen Google Calendar OAuth-tokens of ICS-connectie-secrets — schema wordt wel meegeleverd zodat je dat later kunt aansluiten.
- Geen wijziging aan bestaande project-code.

## Levering

Alles onder `/export/` in dit project. Ik meld per fase kort welke bestanden geschreven zijn. Je kunt daarna `/export/` als geheel kopiëren naar het nieuwe project en de `integration-guide.md` volgen.

## Technische details

- Bron van waarheid voor prompts: `src/lib/voice/process-voice-input.ts`, `src/lib/ai-classify.functions.ts`, `src/lib/assistant/memory-engine.ts` + `memory/classifier.ts`.
- Bron van waarheid voor pipeline: `src/lib/assistant/pipeline.ts` samen met conversation/decision/execution/context/memory/initiative-engines.
- Schema wordt live uitgelezen via `supabase--read_query` op `information_schema.columns`, `pg_policies` en `pg_trigger` — niet gereconstrueerd uit geheugen.
- Migraties krijgen expliciete `GRANT ... TO authenticated` + `service_role` per tabel, volgens de projectconventie; `anon` alleen waar een bestaande policy dat rechtvaardigt.
- Edge Function `text-to-speech` blijft in Deno; ik markeer dat dit de enige echte Edge Function is en dat alle andere logica in TanStack server functions blijft draaien.
