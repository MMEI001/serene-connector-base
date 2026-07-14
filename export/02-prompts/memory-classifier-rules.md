# Memory Classifier Rules

De Memory Engine is **volledig keyword-gebaseerd**, geen LLM-call. Bevestiging vraagt de assistent daarna wél expliciet aan de gebruiker.

**Bestand:** `05-server-code/assistant/memory/classifier.ts`

## Patronen (regex)

| # | Pattern | Categorie | Base conf. |
| --- | --- | --- | --- |
| 1 | `mijn (dochter\|zoon\|kind) ... houdt van X` | `child_interest` | 0.90 |
| 2 | `mijn (dochter\|zoon\|kind) ... doet aan X` | `child_activity` | 0.85 |
| 3 | `ik (ben\|eet) (vegetariër\|veganist\|vegan\|halal\|kosher)` | `food_preference` | 0.90 |
| 4 | `ik eet (geen\|nooit) X` | `food_preference` | 0.80 |
| 5 | `(we hebben\|ik heb) een (hond\|kat\|konijn\|cavia\|paard\|vis) [genaamd X]` | `pet` | 0.85 |
| 6 | `mijn (man\|vrouw\|partner\|moeder\|vader) ... heet X` | `family_member` | 0.90 |
| 7 | `mijn favoriete X is Y` | `favorite` | 0.80 |
| 8 | `mijn hobby is X` | `hobby` | 0.85 |
| 9 | `(ik bestel/koop/winkel altijd\|liever) bij X` | `shop_preference` | 0.75 |
| 10 | `herinner(ingen)? (me\|graag) ... ('s ochtends\|'s avonds\|om HH:MM)` | `reminder_preference` | 0.75 |
| 11 | `we (reizen\|gaan) graag naar X` | `travel_preference` | 0.70 |

## Selectie-regels

- **Max 1 kandidaat per turn** (hoogst-scorende via `futureValue × confidence`).
- **Drempel:** `futureValue × confidence >= 0.35`. Onder deze drempel: geen actie.
- **Duplicate-check:** zelfde `(user_id, category, subject, value)` met status `active` of `pending_confirmation` blokkeert nieuwe insert.
- **Pending TTL:** 5 minuten (`memory/store.ts:12`). Buiten dat window vervalt de bevestigingsvraag.

## Confirmation-detectie

Bevestigingen op openstaande pending-memory (`memory/classifier.ts:160`):

```regex
YES = ^(ja|jazeker|prima|graag|oké|okay|ok|goed|doe maar|leuk)\b
NO  = ^(nee|liever niet|niet doen|nee dank je|laat maar)\b
```

- YES → status wordt `active`; ack: "Top, ik onthoud het."
- NO → status wordt `rejected`; ack: "Helder, ik bewaar het niet."

## Future Value Scoring

**Bestand:** `05-server-code/assistant/memory/future-value.ts`

Per categorie een basis-score, met bonus voor specifieke subject-value combinaties. Zie het bestand voor de exacte tabel. Score bepaalt welke van meerdere gelijktijdige kandidaten wint, en of iets boven de 0.35-drempel komt.

## Actieve memory in prompts

Actieve records worden gelezen door `memory-engine.ts::recall()` en via `context-summary.ts` als kort blok onder de system-prompt geplakt:

```text
HUIDIGE CONTEXT:
...
Wat ik van je weet: dochter houdt van paarden; je bent vegetariër; jullie hond heet Bram.
```

Alleen top 30 actieve records, gesorteerd op `future_value_score DESC`.
