# Locatie- en winkelsuggesties

## Wat er nu gebeurt `[code + prompt]`

Vragen als "waar koop ik X" of "aanbiedingen wijn Albert Heijn" worden door de Brain als `assistant_chat` + `needs_live_info=true` gemarkeerd (prompt-regels 424–429). De pipeline neemt dat op (`voice-pipeline.functions.ts:300-361`) en:

1. `webSearch(live_queries)` haalt max 5 hits van Firecrawl.
2. `synthesizeWithWeb()` maakt reply + `products[]`.
3. UI toont `ProductCard`s onder de reply, met knop **"Toevoegen aan boodschappenlijst"**.

**Belangrijk:** producten worden **NIET** automatisch aan een boodschappenlijst of reminder gekoppeld. De gebruiker moet per kaart klikken.

## Het probleem `[FIX-spec]`

Als de gebruiker eerst zei: **"Zaterdag bloemen kopen voor Ria"** en dan later: **"Waar koop ik mooie tulpen?"** — dan hoort het antwoord (winkels/prijzen) als **notitie of suggestie bij die bestaande reminder** te landen, niet als een nieuwe losstaande boodschappenlijst-note.

Nu gebeurt: er komt een product-lijst; klikken maakt een aparte `notes`-rij zonder relatie tot de eerdere reminder.

## Aan te passen

### 1. Nieuwe context-referentie bewaren

Elke keer dat een `reminder` (of `event`) succesvol wordt aangemaakt, schrijf de referentie naar `voice_experience_state`:

```json
{
  "kind": "last_reminder",
  "data": {
    "reminder_id": "uuid",
    "title": "Bloemen kopen voor Ria",
    "created_at": "..."
  },
  "expires_at": "<+30 min>"
}
```

### 2. Web-synth prompt uitbreiden

Voeg aan `web-synth.server.ts` system-prompt toe:

```text
- Als de gebruiker eerder een openstaande reminder heeft over hetzelfde onderwerp (context wordt onder BRONNEN meegegeven onder [Bestaande context]), koppel je antwoord daaraan: "Ik kan dit meteen bij je reminder 'Bloemen kopen voor Ria' zetten. Wil je dat?"
- Voeg geen aparte boodschappenlijst toe als er al een gerelateerde reminder is.
```

### 3. Nieuw actie-type in server: `attach_to_reminder`

```typescript
// server-fn: attachProductToReminder({ reminder_id, product })
// Update reminders.description of maakt kind-record in nieuwe tabel `reminder_attachments`
```

Migratie:

```sql
create table public.reminder_attachments (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  url text,
  store text,
  price text,
  image text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.reminder_attachments to authenticated;
grant all on public.reminder_attachments to service_role;
alter table public.reminder_attachments enable row level security;
create policy "own" on public.reminder_attachments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 4. UI ProductCard aanpassen

Twee knoppen ipv één:
- **"Bij mijn reminder zetten"** (alleen zichtbaar als `last_reminder` in state)
- **"Op boodschappenlijst"** (huidige gedrag)

### 5. Fallback

Geen actieve reminder-context ⇒ behoud huidig gedrag (nieuwe boodschappenlijst-note). Nooit stil koppelen aan een oude reminder ouder dan 30 min.

## Wat blijft

- Firecrawl blijft de enige externe web-bron.
- Anti-hallucinatie (URL-allowlist) blijft.
- Prijzen alleen als letterlijk in bron.
