# Nederlands & tijden uitspreken

## Wat er nu gebeurt `[code]`

**Bestand:** `05-server-code/speak.ts` en `reminder-format.ts`.

Tijden worden nu vaak als **"09:00"** naar de UI gestuurd. De TTS (ElevenLabs multilingual v2) spreekt dat correct uit als "negen uur", maar Flash v2.5 (default) leest het letterlijk als "nul negen nul nul" of "de nul negen" — precies wat je NIET wilt.

## De gewenste werking `[FIX-spec]`

Regel: elke tijd die naar TTS gaat, is vóóraf naar natuurlijke Nederlandse spraak omgezet.

Voorbeelden:

| Klok | Uit te spreken als |
| --- | --- |
| 09:00 | "9 uur" |
| 10:00 | "10 uur" |
| 10:15 | "kwart over 10" |
| 10:30 | "half 11" |
| 10:45 | "kwart voor 11" |
| 10:20 | "10 over 10" |
| 10:40 | "20 voor 11" |
| 12:00 | "12 uur" (of "12 uur 's middags" bij context) |
| 00:00 | "middernacht" |
| 15:30 | "half 4" (24-uurs → 12-uurs) |

**Nooit** "de 9 uur", "om 09 uur nul nul", "9 punt 0".

## Toe te voegen

### 1. Nieuwe helper `formatDutchTime(hhmm: string): string`

```typescript
// export/05-server-code/speak.ts

export function formatDutchTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);

  // 24u → 12u voor spreektaal
  if (h === 0 && min === 0) return "middernacht";
  if (h === 12 && min === 0) return "12 uur";
  const speakHour = ((h % 12) === 0 ? 12 : h % 12);
  const nextHour = ((h + 1) % 12) === 0 ? 12 : (h + 1) % 12;

  if (min === 0) return `${speakHour} uur`;
  if (min === 15) return `kwart over ${speakHour}`;
  if (min === 30) return `half ${nextHour}`;
  if (min === 45) return `kwart voor ${nextHour}`;
  if (min < 30) return `${min} over ${speakHour}`;
  return `${60 - min} voor ${nextHour}`;
}

export function formatDutchDate(iso: string): string {
  // "2026-07-26" → "zaterdag 26 juli"
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long", day: "numeric", month: "long"
  }).format(d);
}

export function formatSpokenDateTime(iso: string): string {
  const date = formatDutchDate(iso.slice(0, 10));
  const time = iso.length > 10 ? formatDutchTime(iso.slice(11, 16)) : "";
  return time ? `${date} om ${time}` : date;
}
```

### 2. Alle preview- en reply-strings via deze helper

- `voice-pipeline.functions.ts` — de `confirmation_text` die de bevestigingskaart toont.
- `voice/handlers/query.ts` — agenda-overzicht.
- `voice/handlers/reminder.ts` / `event.ts` — bevestigingsantwoord na commit.
- `assistant/experiences/spoken-summary.ts` — clarify-vragen.

### 3. Prompt-regel toevoegen (in TOON-blok)

```text
- Spreek tijden altijd natuurlijk uit: "9 uur", "half 11", "kwart over 3". Nooit "09:00", nooit "de 9 uur", nooit "9 punt 0". Datums natuurlijk: "zaterdag 26 juli", niet "26-07".
```

### 4. TTS model naar `eleven_multilingual_v2` voor gesproken agenda

Voor korte bevestigingen mag `eleven_flash_v2_5` blijven (laagste latency). Voor agenda-overzichten of langere ideeën → schakel naar `eleven_multilingual_v2` (natuurlijkere NL-uitspraak). De edge-function ondersteunt beide via `body.model_id`.
