# Intent-herkenning

## Twee lagen intents

De Brain kiest een **product-intent** (10 waardes) — dat is wat de gebruiker écht wil. Die wordt gemapt op een **VoiceIntent** (7 waardes) — dat is wat het systeem uitvoert.

### Product-intents (Brain-output, 10)

**Bestand:** `voice/process-voice-input.ts:261` `PRODUCT_INTENTS`.

```
conversation | advice | brainstorm | planning
calendar | reminder | shopping | todo
clarification | confirmation
```

### VoiceIntents (handlers, 7)

**Bestand:** `voice/types.ts` (enum en DB-enum `voice_intent`).

```
assistant_chat | reminder | event | note | query | checkin | release
```

### Mapping

**Bestand:** `voice/process-voice-input.ts:452` `mapProductIntent()`.

```
suggested_action.type === "event"    → event
suggested_action.type === "reminder" → reminder
suggested_action.type === "note"     → note
otherwise, per productIntent:
  calendar             → event
  reminder             → reminder
  todo | shopping      → note
  else                 → assistant_chat
```

## Directe agenda-query bypass

**Bestand:** `voice-pipeline.functions.ts:175` `detectAgendaQuery()`. Zonder LLM-call gaat een zin direct naar `handlers/query.ts` als:

- bevat een agenda-woord: `agenda | planning | plan | te doen | staat er | afspraak | afspraken`
- **én** een vraagwoord: `wat | wanneer | hoe laat | heb ik | staat | staan | planning`

Scope-detectie:
| Trigger | Scope |
| --- | --- |
| `overmorgen` | `specific_date` (+2 dagen) |
| `morgen` | `tomorrow` |
| `volgende week` | `next_week` |
| `deze week` / `week` | `this_week` |
| NL weekdag (`maandag`..`zondag`) | `specific_date` (eerstvolgende) |
| `vandaag` | `today` |

## Intent-bias uit persona

**Bestand:** `voice/persona.ts:86` `mapIntentBias()`. `user_profiles.preferred_help_area` verhoogt de kans op een intent bij dubbelzinnigheid:

| Profielwaarde | Bias richting |
| --- | --- |
| "Reminders" | `reminder` |
| "Plannen" | `event` |
| "Loslaten" | `release` |
| "Notities" | `note` |

Bias wordt in de system-prompt zichtbaar als: `- Bij dubbelzinnige zin (bv. "kopen morgen"): kies bij voorkeur <intent> boven andere intents.`

## Locatie / boodschappen

De Brain classificeert "boodschappen" (`shopping`) als **note** met titel "Boodschappenlijst". Locatie-vragen ("waar koop ik X") gaan momenteel via `needs_live_info=true` naar de webtak — zie `location-and-shopping.md` voor de spec-fix.

## Herkomst-labels

| Regel | Label |
| --- | --- |
| 7 VoiceIntents | `[code]` — DB-enum |
| 10 product-intents | `[code + prompt]` |
| Mapping | `[code]` |
| Agenda-bypass keywords | `[code]` |
| Intent-bias uit profile | `[code]` |
| Shopping → note | `[prompt]` — regel in system-prompt |
