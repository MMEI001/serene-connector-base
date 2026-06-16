# HoofdRust — Zen-tech rebrand (4 fases)

Een eerdere ronde heeft al een "warm cream" basis gelegd (Fraunces/Inter, glass surfaces, breathing FAB, basis orb op `/laat-los`). Deze update vervangt en breidt dat consistent uit volgens de nieuwe spec.

## Fase 1 — Design system

- Fonts via `<link>` in `__root.tsx`: **Fraunces** (display), **DM Sans** (body, vervangt Inter), **JetBrains Mono** (numeriek).
- `src/styles.css` herschrijven:
  - Tokens: `--bg-base #F5F0EC`, `--bg-gradient-top #EDE4DD`, `--bg-gradient-bottom #F8F3EE`, `--text-primary #3D352E`, `--text-secondary #8B7E73`, `--text-tertiary #B5A99E`.
  - Source dots: sage `#A8B89A`, dusty-pink `#D9A5A5`, powder-blue `#A5B5C9`, butter `#D4C896`.
  - Accent gradient `--gradient-iridescent: linear-gradient(135deg,#C8B6D9 0%,#E8D4DC 50%,#F0E1D4 100%)`.
  - Radii: `--radius-card 20px`, `--radius-float 24px`, `--radius-pill 999px`. Shadow `--shadow-soft: 0 4px 24px rgba(139,126,115,.08)`.
  - Standaard transition cubic-bezier(0.4,0,0.2,1) 300–500ms.
  - shadcn color mapping (`--background`, `--foreground`, `--primary`, `--muted`, `--destructive`) opnieuw afstemmen — geen rode notificaties; destructive wordt zachte taupe-paars.
- `surface-glass` utility: `bg-white/70 backdrop-blur-[20px] border-white/40 shadow-soft rounded-[20px]`.
- Bestaande hardcoded kleuren/Inter-referenties in components weghalen.

## Fase 2 — `<TimeAwareBackground>`

- Nieuw `src/components/time-aware-background.tsx`, gemount in `app-shell`.
- Bepaalt periode (5–11, 11–17, 17–22, 22–5) en zet CSS-vars op een fixed full-screen `<div>` met radial+linear gradient.
- Periodes:
  - Ochtend `#F0E5E8 → #F8F0E8`
  - Middag `#F5F0EC → #F8F3EE`
  - Avond `#E8DDD5 → #E5DCD8`
  - Nacht `#3D3540 → #2D2832` + sterren-laag (kleine witte dots, css `radial-gradient`, lage opacity).
- Bij periode-overgang: 60s `transition: background 60s linear`. Re-check elke minuut.
- Nacht-modus zet ook `data-theme="night"` op `<html>` zodat tekst-tokens omflippen naar lichte variant.

## Fase 3 — Bottom navigation

- Volgorde: **Agenda · Reminders · Laat los (FAB) · Notities · Profiel** (5 items, 4 normaal + 1 centrale FAB).
- Nieuwe route nodig: `/notities` als alias voor bestaande `journal.tsx` (of journal hernoemen → `notities.index.tsx`). Reminders bestaat al (`/reminders`). Profiel bestaat (`/profiel`).
- Glass-balk: `surface-nav` (`bg-white/60 backdrop-blur-[20px] border-t border-white/40`), safe-area padding.
- 4 line-icons (Lucide, 24px, stroke `--text-secondary`), actieve state krijgt `--text-primary` + onderstreping/dot.
- Laat los FAB: 64×64 rounded-full, iridescent gradient, glow via dubbele `box-shadow` met lavender/peach. 16px boven balk (`-translate-y-4`).
- `motion.button` met continue breathing keyframe (scale 1 → 1.05 → 1, 4s, ease-in-out, infinite). On tap: `navigator.vibrate?.(10)`.

## Fase 4 — `/laat-los` ervaring

- Layout:
  - Tijdgebaseerde groet (Fraunces, 34px) — Goedemorgen/-middag/-avond/-nacht.
  - Subline DM Sans taupe — "Wat wil je loslaten?".
  - `<BreathingOrb>` 240×240 centraal.
  - "Tik om te spreken" + pulserend mic-icoon.
  - Privacy: "Wat je hier zegt blijft bij jou" (12px, text-tertiary).
  - Horizontaal-scrollende pill-rij: "Schrijf in plaats daarvan", "Bekijk eerdere", "Stilte modus".
- `<BreathingOrb>` (`src/components/breathing-orb.tsx`):
  - 240px rounded-full, gelaagde radial gradients (lavender top-left, dusty pink center, pearl peach bottom-right).
  - Box-shadow glow met dezelfde kleurfamilies, blur 60px.
  - `motion.div` breathing 4s. Hover: glow opacity omhoog. Recording: cyclus 2s + warmere tint via class-toggle.
- Tap-flow:
  1. Haptic medium `navigator.vibrate?.(30)`.
  2. State `recording`. Orb sneller + warmer.
  3. (Bestaande voice/transcript-logica wordt hergebruikt; geen backend-wijzigingen.)
- Zen-moment na opslaan:
  - `phase: idle → bloom → fade → silence → reset`.
  - Bloom 800ms (scale 1.3, gradient bloeit), fade-out 600ms, "Losgelaten." in Fraunces, 3s stilte, dan fade terug.
  - Haptic `navigator.vibrate?.([100, 30, 200])` bij bloom-start.

## Bestanden

Nieuw:
- `src/components/time-aware-background.tsx`
- `src/components/breathing-orb.tsx`
- `src/components/zen-release.tsx` (bloom/fade overlay)
- `src/routes/notities.index.tsx` (alias/rename van journal)

Gewijzigd:
- `src/styles.css`, `src/routes/__root.tsx`, `src/components/app-shell.tsx`,
  `src/components/bottom-nav.tsx`, `src/routes/laat-los.index.tsx`,
  agenda/reminders/profiel/journal styling (alleen tokens + glass surfaces).

Geen wijzigingen aan: server functions, DB schema, auth, ICS sync.

## Aannames

- `motion` is al geïnstalleerd (vorige ronde). DM Sans + JetBrains Mono komen van Google Fonts via `<link>`.
- Bestaande Inter-koppeling wordt vervangen door DM Sans; Fraunces blijft.
- Geen nieuwe routes voor "Stilte modus" / "Bekijk eerdere" — pills tonen toast "binnenkort" tot je ze uitwerkt.
- `journal.tsx` wordt **hernoemd** naar `notities.index.tsx`; oude `/journal`-links worden geüpdatet.

Akkoord om alle 4 fases in één keer uit te voeren?
