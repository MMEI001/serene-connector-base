# Bevestiging voor opslaan

## Wat er nu gebeurt `[code]`

**Elke** reminder/event/note-actie die de Brain met `needs_confirmation=true` markeert (default true), landt eerst in `voice_actions` met status `needs_confirmation` en TTL 5 minuten.

- **Voorbereiding:** `voice-pipeline.functions.ts:420-450` — INSERT `voice_actions` met `payload.actions=[...]`, `expires_at=now+5min`, `confirmation_text=<preview>`.
- **UI-check:** `getPendingVoiceAction()` retourneert de meest recente rij < 5 min oud (`voice-confirm.functions.ts:178`).
- **Bevestigen:** `confirmVoiceAction(action_id, overrides?)` roept `commitVoiceBundle` aan, update rij naar `completed`/`failed`, hangt result-referentie mee.
- **Annuleren:** `cancelVoiceAction(action_id)` zet status op `failed` met `error='cancelled'`.
- **Directe uitvoering (geen confirmatie):** alleen wanneer Brain expliciet `needs_confirmation=false` én `action_required=true` returned. Voor `note` gebeurt dit vaak (boodschap toevoegen zonder vragen).

## `commitVoiceBundle`

Loopt door alle acties in `payload.actions[]` en delegeert per actie naar de juiste handler:

| Intent | Handler | Doeltabel |
| --- | --- | --- |
| `event` | `voice/handlers/event.ts` | `appointments` |
| `reminder` | `voice/handlers/reminder.ts` | `reminders` |
| `note` | `voice/handlers/note.ts` | `notes` |
| `release` | `voice/handlers/release.ts` | `let_go_items` |
| `checkin` | `voice/handlers/checkin.ts` | `user_behavior_events` |
| `query` | `voice/handlers/query.ts` | (leest agenda + reminders) |
| `assistant_chat` | geen — reply-only | — |

Elke handler valideert eigen input en produceert een `ActionResult { intent, status, confirmation, ref?, error? }`.

## De gewenste werking `[FIX-spec]`

Regel: **elke** appointment/reminder/event/note moet via bevestiging gaan, tenzij de gebruiker expliciet vraagt "meteen doen" / "gewoon opslaan". Voor `let_go` / `release` mag direct opslaan (dat is juist de bedoeling — uit het hoofd).

## Aan te passen

### 1. System-prompt regel harden

Vervang in het TOOL-schema van `respond`:

```text
"needs_confirmation": { "type": "boolean", "description": "Bij twijfel: true." }
```

met:

```text
"needs_confirmation": { "type": "boolean", "description": "ALTIJD true voor event, reminder en note-acties, tenzij de gebruiker expliciet zei 'gewoon doen' of 'meteen opslaan'. Voor release/checkin: false toegestaan." }
```

### 2. Server-side hardening

In `voice-pipeline.functions.ts`, na de Brain-response:

```typescript
// FIX (spec): dwing bevestiging af voor event/reminder/note, tenzij expliciet
const requiresConfirm = (a: VoiceAction) =>
  a.intent === "event" || a.intent === "reminder" ||
  (a.intent === "note" && !/\b(gewoon|meteen|direct)\b/i.test(text));
if (classified.some(requiresConfirm) && !primary.payload.needs_confirmation) {
  primary.payload.needs_confirmation = true;
}
```

### 3. Preview-tekst per intent

Zorg dat `commitVoiceBundle`'s preview (voor de bevestigingskaart) natuurlijk klinkt:

```
"Ik zet 'Bezoek Ria en Piet' op zaterdag 26 juli. Bevestigen?"
"Ik zet een reminder 'bloemen kopen' voor vrijdag 25 juli 09:00. Bevestigen?"
"Ik zet 'melk, brood, kaas' op je boodschappenlijst. Bevestigen?"
```

Zie `dutch-language.md` voor tijdformattering ("9 uur" niet "09:00" in gesproken tekst).

### 4. Auto-expire dispatcher

De huidige TTL van 5 min is een `expires_at` kolom-check zonder cron. Overweeg een `pg_cron` job:

```sql
select cron.schedule('voice-actions-expire', '* * * * *', $$
  update public.voice_actions
  set status='failed', error='expired'
  where status='needs_confirmation' and expires_at < now();
$$);
```

Niet strict nodig, maar houdt de tabel schoon en voorkomt dat een oude bevestiging na 10 minuten alsnog "onverwacht" wordt opgeslagen.
