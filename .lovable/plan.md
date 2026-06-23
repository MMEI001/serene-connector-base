# Personalisatie van HoofdRust op basis van onboarding

Doel: twee gebruikers stellen dezelfde vraag, krijgen een antwoord dat past bij hun voorkeuren — in toon, lengte, hoeveelheid suggesties en standaard-acties.

## Architectuur in één blik

```text
user_profiles (DB)
      │
      ▼
buildUserPersona(profile)   ← één pure functie, server-side
      │   produceert:
      │     - personaPrompt   (NL system-prompt fragment)
      │     - personaHints    (gestructureerde defaults: max_suggestions, default_intent_bias, reminder_lead_time…)
      ▼
┌─────────────────────────┬──────────────────────────┬─────────────────────────┐
│ process-voice-input     │ voice handlers           │ daily-ritual / speak    │
│ (classifier system msg) │ (query/suggestion output)│ (begroeting + TTS toon) │
└─────────────────────────┴──────────────────────────┴─────────────────────────┘
```

Eén bron van waarheid (`buildUserPersona`) — overal hetzelfde profiel, geen drift.

## Mapping: onboarding-antwoord → gedrag

| Veld | Beïnvloedt | Concreet effect |
|---|---|---|
| `primary_goal` (multi) | system-prompt intro | "Focus op overzicht/rust/plannen…" als context-zin |
| `support_style` (single) | toon + lengte | `Rustig en zacht` → langere, zachte zinnen · `Kort en duidelijk` → max 1 zin, geen vulwoorden · `Meedenkend` → 1 reflectievraag toegestaan · `Zo min mogelijk` → alleen bevestiging, geen extra tekst |
| `overstimulation_level` (single) | max output-lengte + suggestie-cap | `Heel vaak` → hard cap 1 suggestie, geen emoji, geen vragen terug · `Bijna nooit` → mag meer details geven |
| `suggestion_count_preference` | `personaHints.max_suggestions` | `Eén tegelijk`=1 · `Twee of drie`=3 · `Maakt me niet uit`=3 (default) |
| `preferred_help_area` (multi) | intent-bias bij dubbelzinnige zinnen | bv. "kopen morgen" → met `Reminders` in voorkeur → reminder; met `Plannen` → event |
| `reminder_style` | reminder-handler default | bv. `op de dag zelf` vs `dag van tevoren` → default lead-time wanneer gebruiker geen tijd noemt |
| `planning_style` | event-handler default | bv. `met buffer` → default 15 min marge voor/na · `strak` → exacte tijden |

Onbekende/`null` velden → neutrale defaults (huidige gedrag).

## Wat te bouwen

### 1. `src/lib/voice/persona.ts` (nieuw, server-safe pure module)
- `type UserPersona = { promptFragment: string; hints: PersonaHints }`
- `type PersonaHints = { maxSuggestions: number; tone: "soft"|"brief"|"thoughtful"|"minimal"; reminderLeadHours: number|null; planningBufferMinutes: number; intentBias: VoiceIntent[]; allowFollowupQuestion: boolean }`
- `buildUserPersona(profile: UserProfileRow | null): UserPersona` — deterministisch, geen I/O, makkelijk te unit-testen.
- `renderPersonaPrompt(persona)`: produceert NL system-prompt fragment, bv:
  ```
  GEBRUIKERSPROFIEL
  - Doel: meer overzicht, rust
  - Gewenste toon: kort en duidelijk (max 1 zin, geen vulwoorden)
  - Overprikkeling: vaak (geen tegenvragen, max 1 suggestie)
  - Hulp bij voorkeur: reminders, loslaten
  - Bij dubbelzinnige tijd: kies reminder boven event
  ```

### 2. `src/lib/voice/load-persona.functions.ts` (nieuw)
- `loadPersona = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(...)` → leest `user_profiles` voor `context.userId`, retourneert `UserPersona`.
- Cache binnen één request (closure-memo), niet globaal (stateless workers).

### 3. Classifier — `src/lib/voice/process-voice-input.ts`
- Functie krijgt `persona` mee en concatenate `renderPersonaPrompt(persona)` ná de bestaande system-prompt.
- Gebruikt `persona.hints.intentBias` in een extra zin: "Bij twijfel tussen event/reminder: kies reminder."
- `MAX_ACTIONS` blijft 3, maar prompt zegt: "geef max ${persona.hints.maxSuggestions} suggesties wanneer een query meerdere antwoorden heeft."

### 4. Pipeline — `src/lib/voice-pipeline.functions.ts`
- Roept `loadPersona` aan vóór `classify`, geeft persona door aan classifier én aan handlers.
- Slaat `persona_hash` (sha-256 van JSON) op in `voice_actions.payload.meta` zodat we later A/B kunnen analyseren.

### 5. Handlers
- `handlers/query.ts`: gebruikt `persona.hints.maxSuggestions` om resultaat-lijst af te kappen + `tone` om antwoord-zin te formuleren (rustig vs. brief).
- `handlers/reminder.ts`: bij ontbrekende tijd → `09:00` blijft; bij ontbrekende dag-offset bij gekoppelde reminder → `persona.hints.reminderLeadHours`.
- `handlers/event.ts`: voegt `planningBufferMinutes` toe aan default-duur als gebruiker geen eindtijd noemt.

### 6. TTS / dagritueel
- `src/lib/speak.ts` & `src/lib/daily-ritual.ts`: lezen al `user_profiles`; vervang ad-hoc velden door `buildUserPersona` zodat begroeting + stem-lengte consistent zijn met chat-output.

### 7. Tests (vitest)
- `persona.test.ts`: dekt elke `support_style`/`overstimulation_level` combinatie, lege profile, partial profile.
- Snapshot van `renderPersonaPrompt` voor 3 archetypen (rustige gebruiker, brief-en-zakelijk, overprikkeld).

## Wat NIET in deze ronde

- Geen embeddings / RAG over historisch gedrag (over-engineering nu).
- Geen UI om persona-effect live te previewen — komt pas als de basis loopt.
- Geen migrations: alle benodigde kolommen bestaan al in `user_profiles`.

## Acceptatiecriteria

1. Gebruiker A (`support_style="Kort en duidelijk"`, `overstimulation_level="Heel vaak"`, `suggestion_count_preference="Eén tegelijk"`) vraagt "Wat staat er morgen?" → resultaatkaart toont **max 1** item + één korte zin, geen tegenvraag.
2. Gebruiker B (`support_style="Rustig en zacht"`, `suggestion_count_preference="Twee of drie"`) zelfde vraag → tot 3 items, zachtere formulering.
3. Beide gebruikers zeggen "kopen morgen" zonder context: A met `preferred_help_area=["Reminders"]` → reminder bevestigingskaart; B met `["Plannen"]` → event-kaart.
4. `voice_actions.payload.meta.persona_hash` gevuld.

Geef akkoord en ik bouw stap 1→6 in deze volgorde; tests in dezelfde batch.
