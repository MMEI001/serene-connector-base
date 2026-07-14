# Ongevraagde suggesties (Initiative Engine)

## Wat er nu gebeurt `[code]`

**Bestand:** `05-server-code/assistant/initiative-engine.ts`

De Initiative Engine berekent per turn een **Opportunity Score**. Bij hoge score voegt de pipeline een proactief voorstel toe aan de reply ("Ik zag dat je morgen om 9 uur een afspraak hebt — zal ik daar een reminder voor zetten?"). Beslissing is heuristisch: aantal afspraken vandaag, dagdeel, aanwezigheid van openstaande memories, e.d.

Daarnaast bestaat `suggestion-engine.ts` (`propose()`) die per turn 0..N "skills" kan voorstellen op basis van context-snapshot en de conversation-uitkomst.

**Praktisch:** dit betekent dat de assistent soms uit zichzelf voorstellen doet, ook als de gebruiker niets vroeg.

## De gewenste werking `[FIX-spec]`

Regel: **geen ongevraagde suggesties**. De assistent doet alleen voorstellen wanneer:

1. De gebruiker expliciet vraagt ("wat kan ik doen?", "help me").
2. De gebruiker een actie start die om afronding vraagt (bv. reminder zonder datum → vraag om datum, dat is geen suggestie maar noodzaak).
3. Het is de daily-briefing (aparte flow, `daily-briefing.functions.ts`).

Op de gewone spraak-orb: stil zijn tenzij gevraagd.

## Aan te passen

### 1. Prompt-regel toevoegen (bovenaan WAT JE MAG)

Vervang:

```text
- Maximaal één vervolgstap aanbieden — en alleen als die de gebruiker echt ontlast. Bij twijfel: geen actie, wel een warm inhoudelijk antwoord.
```

met:

```text
- Alleen een vervolgstap aanbieden als (a) de gebruiker er expliciet om vraagt, OF (b) de gebruikersvraag zelf een actie IS (bv. "zet tandarts morgen 9 uur"). Nooit uit jezelf voorstellen doen als de vraag puur conversationeel is (advies, brainstorm, gevoel delen).
- Bij twijfel: geen actie, geen suggestie — alleen een warm inhoudelijk antwoord.
```

### 2. Initiative Engine hard uitzetten voor gewone turns

In `assistant/pipeline.ts`, vervang de `shouldTakeInitiative` call door:

```typescript
// FIX (spec): Initiative Engine alleen actief voor daily-briefing.
const init = { value: { score: 0, helpKind: null, reasons: ["initiative_disabled_by_spec"] }, ms: 0 };
```

Of behoud de call maar gooi resultaat weg tenzij `input.source === "daily_briefing"`.

### 3. Suggestion Engine trimmen

`suggestion-engine.ts::propose()` moet leeg teruggeven wanneer de Brain zelf geen `suggested_actions` heeft opgeleverd. Verwijder heuristics die "zelf" een actie voorstellen zonder Brain-input.

### 4. Daily briefing behouden

`daily-briefing.functions.ts` blijft ongewijzigd — dat is een expliciet aangevraagde flow.
