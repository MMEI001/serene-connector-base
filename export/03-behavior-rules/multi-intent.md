# Multi-intent per zin

## Wat er nu gebeurt `[code]`

De Brain **kán** meerdere `suggested_actions` teruggeven (`maxItems: 3`), maar de system-prompt zegt expliciet:

> "Maximaal één vervolgstap aanbieden — en alleen als die de gebruiker echt ontlast."

In de code (`voice/process-voice-input.ts:692-702`) worden alle suggested_actions doorgezet **als** `action_required=true && needs_confirmation=false`. Bij `needs_confirmation=true` (de meest voorkomende default) gaan alle acties samen als bundle in één `voice_actions.payload.actions[]` rij (`voice-pipeline.functions.ts:420-435`), en `confirmVoiceAction` roept `commitVoiceBundle` aan die álle acties in de bundle uitvoert (`voice-confirm.functions.ts:108`).

**Resultaat:** de infra ondersteunt multi-actie, maar de prompt ontmoedigt het actief.

## De gewenste werking `[FIX-spec]`

Zin: **"Zaterdag bezoek Ria en Piet, één dag ervoor bloemen kopen"** moet twee acties opleveren:

1. `event` — titel "Bezoek Ria en Piet", datum eerstvolgende zaterdag.
2. `reminder` — titel "Bloemen kopen", datum vrijdag ervoor 09:00.

## Aan te passen

### 1. System-prompt regel toevoegen (bovenaan SUGGESTED_ACTIONS REGELS)

```text
- ÉÉN zin kan meerdere acties bevatten wanneer er duidelijk twee losse dingen gebeuren op verschillende momenten. Voorbeeld: "zaterdag bezoek Ria en Piet, één dag ervoor bloemen kopen" → 1 event (zaterdag) + 1 reminder (vrijdag). Beide in suggested_actions, elk met eigen iso_datetime. needs_confirmation=true zodat de gebruiker beide in één keer kan bevestigen of één kan corrigeren.
- Als er twee losse acties zijn, is de max niet 1 maar 2. Combineer ze NOOIT tot één actie.
```

### 2. Voorbeeld in prompt toevoegen (onder VOORBEELDEN)

```text
- Gebruiker: "Zaterdag bezoek Ria en Piet, één dag ervoor bloemen kopen."
  Behoefte: twee dingen tegelijk vastleggen zonder tweemaal te hoeven praten.
  Reply: "Ik zet 'bezoek Ria en Piet' klaar op zaterdag, en een herinnering 'bloemen kopen' op vrijdag 09:00. Wil je beide bevestigen?"
  → intent="planning", action_required=true, needs_confirmation=true,
     suggested_actions=[
       {type:"event", title:"Bezoek Ria en Piet", date:"<zaterdag>", start_time:null},
       {type:"reminder", title:"Bloemen kopen", iso_datetime:"<vrijdag>T09:00:00+02:00"}
     ].
```

### 3. Preview-tekst in `commitVoiceBundle`

De huidige preview toont vaak alleen de eerste actie. Update `voice/dispatch-voice-action.ts` (of maak een `buildBundlePreview(actions)` helper) zodat de bevestigingskaart alle acties samenvat, bv:

```
- 📅 Zaterdag 26 juli: Bezoek Ria en Piet
- ⏰ Vrijdag 25 juli 09:00: Bloemen kopen
```

### 4. Multi-item override

`voice-confirm.functions.ts:100` past overrides alleen toe op de eerste `reminder|event` actie. Voor multi-actie moet de UI kunnen kiezen welke actie te bewerken (index-based). Voeg toe: `overrides.action_index?: number`.

## Wat er NIET verandert

- Max blijft 3 acties (`MAX_ACTIONS`).
- Bundle-execution loopt al via `commitVoiceBundle` — atomair per actie, geen extra transactie nodig.
- Rollback bij één falende actie blijft "best-effort": andere acties in de bundle blijven staan; UI toont `errors[]`.
