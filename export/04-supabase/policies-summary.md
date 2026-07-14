# Policies — plain-language overzicht

Per tabel: wie mag lezen, aanmaken, wijzigen of verwijderen, en onder welke voorwaarde. Alle policies zijn scoped op `auth.uid() = user_id` tenzij anders vermeld.

| Tabel | Wie mag lezen | Wie mag schrijven | Bijzonderheid |
| --- | --- | --- | --- |
| `profiles` | eigen gebruiker | eigen (insert + update, geen delete) | key = auth.users.id (1-op-1) |
| `user_profiles` | eigen | eigen (alles) | onboarding-antwoorden + persona |
| `appointments` | eigen | eigen (alles) | date verplicht |
| `reminders` | eigen | eigen (alles) | mag verwijzen naar een appointment |
| `notes` | eigen | eigen (alles) | title optioneel |
| `let_go_items` | eigen | eigen (alles) | linked_item_type/id voor context |
| `ai_suggestions` | eigen | eigen (alles) | status flow: pending → accepted/dismissed |
| `assistant_memory` | eigen | eigen (alles) | ja/nee-bevestiging via UI |
| `voice_transcriptions` | eigen | eigen (insert only) | telemetrie |
| `voice_intents` | eigen | eigen (insert only) | audit-log Brain |
| `voice_actions` | eigen | eigen (alles) | needs_confirmation-flow |
| `voice_errors` | eigen | eigen (insert only) | fouten uit STT/TTS |
| `voice_experience_state` | eigen | eigen (alles) | 15-min sessie-context |
| `calendar_connections` | eigen | eigen (alles) | Google OAuth tokens (encrypt binnenkort) |
| `calendar_preferences` | eigen | eigen (alles) | per calendar_id aan/uit |
| `ics_calendars` | eigen | eigen (alles) | URL wordt periodiek gesynct |
| `ics_events` | eigen (via parent-calendar) | eigen (via parent-calendar) | policies via EXISTS-subquery op ics_calendars |
| `user_behavior_events` | eigen | eigen (insert only) | product-analytics |

## Anon-rechten

**Geen enkele tabel** grant leesrechten aan `anon`. De hele Data-API is signed-in only.

## Service role

Alle tabellen hebben `GRANT ALL ... TO service_role` — nodig voor:
- ICS-sync-cron (`api/public/hooks/sync-ics.ts`)
- Toekomstige admin-tasks
- Migrations en debug via SQL-editor

## Enum-referenties

Deze enums worden door meerdere tabellen gebruikt — beschadig ze niet zonder alle callers te controleren:

- `voice_intent` → `voice_intents.intent`, `voice_actions.intent`
- `voice_action_status` → `voice_actions.status`
- `item_source` → `appointments.source`, `reminders.source`
- `memory_category` + `memory_status` → `assistant_memory`
