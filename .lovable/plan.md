# Bevindingen Assistant Mode

## Laatste 5 `voice_actions` rijen (jouw user_id)

Alle 5 zijn vóór 11:41 UTC opgeslagen — identiek patroon:

| created_at (UTC) | intent | status | error | confirmation_text | payload |
|---|---|---|---|---|---|
| 11:35:12 | assistant_chat | failed | missing_fields | "Ik miste de tijd of het onderwerp." | `{actions:[{intent:reminder, confidence:0.7, payload:{}}, …]}` |
| 11:34:47 | assistant_chat | failed | missing_fields | idem | idem (3 lege reminders) |
| 11:32:12 | assistant_chat | failed | missing_fields | idem | idem (3 lege reminders) |
| 11:31:52 | assistant_chat | failed | missing_fields | idem | `{actions:[{intent:reminder, confidence:0.7, payload:{}}]}` |
| 11:31:38 | assistant_chat | failed | missing_fields | idem | idem (1 lege reminder) |

Daarvoor: gewone reminder/query rijen, alle `completed`.

## De preview heeft de fix nog niet getest

- `src/lib/voice-pipeline.functions.ts` en `src/lib/voice/process-voice-input.ts` zijn voor het laatst gewijzigd om **11:41:00 / 11:41:17 UTC**.
- Jouw laatste test was **11:35:12 UTC** — dus **6 minuten vóór** de fix in de sandbox stond.
- Sinds 11:41 zijn er **0 nieuwe `voice_actions` rijen**. De fix is dus nog niet getest.

De fix is wel aanwezig in de source (geverifieerd):
- `amsterdamIso` + `deriveDefaultIso` aanwezig in `voice-pipeline.functions.ts` (regels 16, 52, 88)
- `assistant_chat` failsafe + reply-meesturen aanwezig (regels 140–187, 213–230)
- Lege `payload.iso_datetime` wordt automatisch ingevuld via `deriveDefaultIso(text)` (regel 160)
- Lege `title` wordt afgeleid uit `assistantReply` (regel 162)

De `Unable to post message to https://lovable.dev` console-melding is niet gerelateerd — dat is een onschuldige cross-origin postMessage uit de Lovable preview-wrapper.

## Plan

1. **Hard refresh in de preview** (Cmd+Shift+R / Ctrl+Shift+R) zodat HMR de nieuwe `voice-pipeline.functions.ts` zeker laadt.
2. **Hertest** met exact dezelfde zin: *"Ik heb zaterdag een verjaardag, zal ik bloemen kopen?"*
3. **Ik haal direct daarna** de nieuwste `voice_actions` rij op en plak intent / status / error / confirmation_text / payload terug — dan zien we of de defaults effectief zijn ingevuld.
4. **Als het opnieuw `failed / missing_fields` is** voeg ik in build-mode extra `console.log` toe rond:
   - `processVoiceInput` return-shape (loggen welke `suggested_actions` GPT teruggeeft)
   - Het normalisatieblok in `voice-pipeline.functions.ts` (vóór en ná defaults)
   - `dispatchVoiceBundle` per-action result
   En kijk ik via `stack_modern--server-function-logs` mee.
5. **Als GPT überhaupt geen `suggested_actions` teruggeeft** voor advies-zinnen, scherp ik de prompt verder aan zodat assistant_chat zonder suggested_actions ook accepteert wordt (alleen reply → completed, geen bevestigingskaart).

Geen code-wijzigingen in deze stap — eerst hertest na hard refresh + nieuwe DB-rij ophalen.
