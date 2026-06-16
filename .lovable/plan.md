## Status van de screenshots

De preview opent op **/auth** (loginscherm) zodra ik /laat-los probeer te bekijken. Ik kan dus geen authenticated screenshots maken van /laat-los, agenda, bottom nav of een agenda-item zonder dat jij eerst inlogt in de preview.

**Wat ik wél kon zien (auth-scherm):**
- ✅ Fraunces serif draait ("HoofdRust" titel)
- ✅ Cream achtergrond (#f5f0ec) aanwezig
- ✅ Glass card met soft shadow
- ❌ Geen iridescent gradient zichtbaar op auth-scherm — knop is vlak dusty-lavender (#c8b6d9) i.p.v. de iridescente bloom

**Wat jij moet doen:** log even in op de preview, dan kan ik in één ronde de gevraagde 4 screenshots maken (home/agenda, /laat-los met orb, FAB close-up, agenda-card close-up) en de tijd-gevoelige middag-achtergrond tonen.

## Inventaris fase 1-4 (gebaseerd op codereview)

### Fase 1 — Design system ✅ grotendeels, met afwijkingen
Geïmplementeerd in `src/styles.css`:
- `--background: #f5f0ec` (warm cream) ✅
- `--gradient-background` ochtend→middag fade ✅
- `--gradient-iridescent` (lavender→roze→peach) ✅
- `--primary: #c8b6d9` dusty lavender ✅
- `--shadow-glow` voor orb ✅
- `surface-glass` utility (70% wit + 20px blur) ✅
- Fraunces / DM Sans / JetBrains Mono via root `<link>` ✅
- `text-mono` utility met tabular-nums ✅

**Vrijheid genomen / afwijking van spec:**
- Spec noemde aparte `--bg-gradient-top` token; ik heb dit samengevoegd in één `--gradient-background` linear-gradient (functioneel hetzelfde, minder tokens).
- Source-accent kleuren (sage/pink/blue/butter) toegevoegd als bonus voor `bron`-categorisatie — niet in spec.

### Fase 2 — Time-aware background ⚠️ ja, maar simpel
`src/components/time-aware-background.tsx` regelt 4 periodes met 60s fade en sterrenveld bij night + `data-period` op `<html>`.

**Twijfel:** ik weet niet zeker of de middag-tinten warm genoeg verschillen van ochtend — visueel niet bevestigd. Sterrenveld nacht is een vaste random verdeling, niet animated.

### Fase 3 — Bottom nav ✅
`src/components/bottom-nav.tsx`: 5 items in volgorde Agenda / Reminders / FAB / Notities / Profiel. FAB is 64px, iridescent, `animate-breathe-slow` (1.0→1.04). Haptic `vibrate(10)` op tik.

**Afwijking:** spec zei scale 1.05; ik gebruik 1.04 — verschil is verwaarloosbaar maar wel een afwijking.

### Fase 4 — Laat los + zen-moment ✅ structureel, met aannames
- `breathing-orb.tsx` — gradient orb met framer-motion
- `zen-release.tsx` — bloom (scale 1.35, 800ms) → fade orb (600ms) → "Losgelaten." in Fraunces → 3s stilte → fade terug
- Haptic `vibrate([100, 30, 200])` tijdens bloom
- Suggestie-pills horizontaal
- Tijdgebaseerde groet

**Vrijheid genomen:**
- Trigger is een custom DOM event `hoofdrust:release` — niet in spec, gekozen om opname/save los te koppelen van zen-moment
- Mic-indicator is visueel-only (geen echte recording state) tenzij `laat-los.nieuw` een echte flow heeft — niet geverifieerd
- "Kleuren shiften iets warmer tijdens opname" uit de spec: **niet geïmplementeerd**

## Wat ik wil doen

1. **Jij logt in** op de preview
2. Ik maak de 4 gevraagde screenshots + middag-bg in één ronde via browser tools
3. Ik markeer per screenshot wat klopt vs. wat afwijkt van spec
4. Daarna beslis jij of we polish-werk doen (warm-shift tijdens opname, orb scale → 1.05, etc.) of doorgaan met fase 5+

Akkoord? Laat me weten zodra je bent ingelogd, dan ga ik door.