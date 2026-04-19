# DESIGN.md — navigation-project
Last updated: 2026-04-18

## Design Intent

Marine navigation UI for a Raspberry Pi 4 kiosk on a 1978 Sisu 22 (small diesel power boat, shallow-draft, coastal use). Operator is one person at the helm reading the screen with possibly wet hands, in glare, while underway. Optimize for **glanceability** and **honesty** about data quality.

## Design Principles

1. **Plain-language over jargon.** Narrative summaries first, raw numbers secondary. The screen reads like a person describing the scene, not a sensor dump.
2. **Marine-canonical units with English translation in parens.** `13 knots (15 mph)`, `650 meters (711 yards)`, `3.2 nautical miles (3.7 miles)`. Lets a learning operator build intuition without forcing mental math; preserves marine convention for radio calls.
3. **Honest data display.** Stale, invalid, or partial data is shown but visually distinct. Don't fake completeness. Bad data never drives alarms.
4. **Datasheet brutalism.** Hard rectangles, navy borders, no shadows, no transitions, no hover effects. The aesthetic is marine instrument, not SaaS dashboard.
5. **WCAG 2.2 AAA by default.** Not bolted on at the end — designed in. Operator may have impaired vision, gloves, glare, or be in motion.
6. **Color is semantic, not decorative.** Each functional color is reserved for one meaning (orange = own boat; electric blue = AIS vessel name; amber = caution; red = danger; sage = waypoints).

## Visual Language

### Color Palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| Body / app bg | `--bg-navy` | `#142038` | Body, StatusBar, AIS panel container |
| Card surface | `--surface-sand` | `#F0EBE0` | AIS rows, all data cards |
| Card surface (stale) | `--surface-sand-stale` | `#D8D0BC` | Stale AIS rows — dimmer sand that still passes 7:1 |
| Text on navy | `--text-primary` | `#F0EBE0` | All text on bg/StatusBar |
| Text on sand | `--text-on-card` | `#142038` | All text on AIS cards |
| Text dim on navy | `--text-dim` | `rgba(240,235,224,0.78)` | StatusBar metric labels |
| Text dim on sand | `--text-on-card-dim` | `rgba(20,32,56,0.82)` | Card movement line, raw facts |
| Own boat | `--boat-icon` | `#FF6B35` | Heading glyph; own-ship triangle fill on chart |
| Own boat accent | `--ownship-accent` | `#CCFF00` | Tennis-ball yellow-green. Own-ship triangle outline, pulsing ring, heading vector. Reserved — nowhere else. |
| AIS vessel name | `--vessel-name` | `#0F0298` | Card name only |
| Caution | `--alert-amber` | `#E8B84D` | Stale qualifier border, GPS-stale pill, threat-caution bar/pill |
| Danger | `--alert-red` | `#A02418` | Threat-danger bar/pill (for fills on sand; cream text on it ≥7:1) |
| Future waypoints | `--waypoint` | `#6B9080` | Reserved for routes/waypoints |
| GPS OK | `--ok` | `#5BD891` | Status pill text on navy |
| GPS no-fix | `--danger` | `#FFA0A0` | Status pill text on navy (different use case from `--alert-red`) |
| Focus ring | `--focus-ring` | `#E8B84D` | 3px outline + 2px offset on `:focus-visible` |

### Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Page H1 (sr-only or visible) | Zalando Sans Expanded | 24px | 700 | Chart placeholder visible; AIS hidden via `.sr-only` |
| Vessel name (StatusBar) | Zalando Sans Expanded | 15px | 700 | |
| Vessel name (AIS card) | Zalando Sans Expanded | 15px | 700 | Color: `--vessel-name` |
| Card location | Zalando Sans Expanded | 15px | 500 | Primary narrative line |
| Card movement | Zalando Sans Expanded | 14px | 400 | Secondary narrative |
| Card qualifier | Zalando Sans Expanded | 13px | 600 | Amber-tinted bg, navy text |
| Card raw facts | Roboto Mono | 11px | 400 | Mono for tabular alignment |
| StatusBar metric value (display) | Zalando Sans Expanded | 15px | 700 | tabular-nums |
| StatusBar metric value (mono) | Roboto Mono | 13px | 500 | Lat/lon only |
| StatusBar labels / fix indicator / tabs | Zalando Sans Expanded | 10–14px | 600 | Uppercase for labels & pills |

Font sources: Google Fonts CDN during dev. Self-hosting via `@fontsource/*` is required before Pi install (boat won't always have internet).

### Spacing & Grid

- Base unit: 4px (informal — not a strict scale).
- AIS panel padding: 16px.
- AIS card padding: 16px (12px in compact split mode).
- AIS card gap: 16px.
- StatusBar padding: 10px / 16px.
- Tab/button min-height: 44px (AAA target size).

### Motion

**Almost none, by design.** The brutalist aesthetic excludes motion. Only motion in the app:

- Heading glyph rotates with COG: `transition: transform 0.3s ease-out`. Disabled under `prefers-reduced-motion`.

No hover lifts, no entry animations, no tab transitions. Adding motion to a new component requires explicit justification and `prefers-reduced-motion` handling.

## Component Inventory

### StatusBar (`src/components/StatusBar.tsx`)
- **Purpose:** Always-visible chrome showing own-vessel ID, GPS state, almanac, primary metrics, view-mode toggle.
- **Sections (left → right):** vessel name + GPS fix pill + Almanac (time · sun · tide) | lat / lon / speed / heading metrics | view tabs (Split / AIS / Chart).
- **States:** GPS ok / stale / no-fix; heading glyph hidden when GPS stale or no-fix (honesty).
- **Accessibility:** Wrapped in `<header>`. Tabs in `<nav aria-label="View">` with `aria-pressed` per button.

### Almanac (`src/components/Almanac.tsx`)
- **Purpose:** Glanceable local-environment context — what time is it, when's the next sun event, where's the tide.
- **Format:** `2:32 PM · ☀↘ 7:47 PM · 〰↗ High 4:15 PM` — 12-hour time, sun glyph + arrow + time, tide glyph + arrow + kind + time.
- **Cadence:** updates once a minute. Computes next sun event from current GPS position via `suncalc` (offline). Tide currently uses a single-constituent stub — see CLAUDE.md "Almanac" for the NOAA upgrade path.

### AIS list (`src/components/AISList.tsx`)
- **Purpose:** Shows all AIS targets sorted by threat band then distance.
- **Variants:** full and `compact` (used in split-view 30% column — drops raw-facts line, tightens type).
- **Filter toggle:** All vessels / Active only (hides stale + invalid + positionless).
- **Threat bands:** monitor (default), caution (8px amber inset bar + pill), danger (8px red inset bar + pill, sorted to top).
- **Stale row treatment:** dimmer sand surface (`--surface-sand-stale`), not opacity (preserves AAA contrast).
- **Empty states:** different copy for "no targets yet" vs "no active vessels."

### AIS card row
- **Lines (top → bottom):** [optional threat pill] → vessel name → location narrative → movement narrative → [qualifier (amber, if stale)] → raw facts (mono).
- **Aesthetic:** 1px solid navy border, no shadow, hard rectangle.

### Chart (`src/components/ChartCanvas.tsx`, rendered by `src/pages/ChartPage.tsx`)
- **Library:** Leaflet via `react-leaflet@^4` (v5 needs React 19; we're on 18).
- **Tiles:** OpenStreetMap CDN for laptop dev; NOAA raster MBTiles via local tile server on Pi (deferred).
- **Own-ship marker (triple design):** 40px orange triangle with 2px yellow-green outline (rotates with COG); yellow-green pulsing ring (40 → 56px over 2s, the only animation in the entire UI); yellow-green heading-vector polyline showing 1 minute of predicted travel at current SOG. Replaced by static halo under `prefers-reduced-motion`.
- **AIS markers:** divIcon SVG, colored by threat band — sand (monitor), amber (caution), red (danger). Targets with COG render as oriented chevrons; without (anchored) as circles. Stale → 0.55 opacity.
- **Auto-recenter:** map snaps to own-ship on every position update. v1 — free-pan and recenter button deferred.
- **Resize handling:** ResizeObserver on the map container calls `invalidateSize()` so view-mode toggling (which uses `display:none`) doesn't leave stale tile sizes.
- **Leaflet UI:** zoom controls and attribution restyled for the brutalist aesthetic (hard rectangles, sand fill, navy text). See `app.css` `.leaflet-bar` / `.leaflet-control-attribution`.

### View modes (in `src/App.tsx`)
- `split` (default), `ais`, `chart`. CSS `display:none` controls visibility — both columns always in DOM so state survives toggling.

## Layout & Navigation

- **Single page app, no router** — kiosk doesn't need URLs.
- **Three view modes:** controlled by StatusBar tabs.
- **Split mode (default):** AIS 30% (clamped 260–400px) | chart 70%.
- **AIS only:** centered, max-width 720px.
- **Chart only:** full width.

Decision deferred from audit: chart-on-right vs chart-on-left. Currently right; revisit once Leaflet is in place and we can A/B at the helm.

## Key Screens

### Split view (default)
- **Purpose:** Primary nav-while-underway view — chart + traffic both visible.
- **Entry:** App load.
- **Exit:** Toggle to AIS-only or Chart-only.

### AIS only
- **Purpose:** Detailed traffic scan; lookup specific vessel; read raw facts (MMSI, exact COG/SOG) for radio call.
- **Entry:** Toggle from StatusBar.

### Chart only
- **Purpose:** Maximum chart real estate for navigation in tight or unfamiliar waters.
- **Entry:** Toggle from StatusBar.

## Research & Evidence

No formal user research. Design is informed by:
- Operator profile (project owner) — single user, known operator preferences.
- Marine domain conventions (knots, nm, AIS terminology, plotter UX patterns).
- WCAG 2.2 AAA criteria (formal accessibility audit applied — see `/wcag` skill).
- UI/UX heuristic audit (see `/Users/lauradoran/.claude/plans/alright-should-we-do-adaptive-peacock.md`).

## Accessibility Approach

Target: **WCAG 2.2 Level AAA** (not just AA). See CLAUDE.md "Accessibility — WCAG 2.2 AAA" for the working constraints. Every text/surface pairing in the palette has been computed to ≥7:1. Touch targets ≥44px. Focus ring 3px amber. `prefers-reduced-motion` respected. `<header>` / `<main>` / `<nav>` landmarks. `aria-pressed` on toggle buttons, `aria-label` on nav, `aria-live="polite"` on filter-count.

## Open Design Questions

- [ ] **Chart-on-right vs chart-on-left** in split view (M1 from UI/UX audit). Decide after Leaflet is in.
- [ ] **Compact-card density** in split view (M3 from audit) — possibly two-line condensed format or top-N expanded + rest one-line.
- [ ] **Filter toggle location** (m3 from audit) — keep above list or move to StatusBar?
- [ ] **Vessel-name electric blue affordance** (m1 from audit) — reads as link. Either commit to tappable detail panel or shift hue.
- [ ] **Touch-target size for marine use** (m2 from audit) — bump tabs from 44px to 56–64px for wet/gloved hands?
- [ ] **Threat marker styling on chart** when Leaflet lands — how to visualize danger/caution targets on the map.
- [ ] **Vessel mark / monogram** for own-boat icon — give the app a brand element using `--boat-icon` orange.

## Design Change Log

### 2026-04-18 — Threat-banding color extension
- **Was:** Status colors were `--ok #4fbf7a`, `--danger #e05a5a`. Single red used for all "bad" states.
- **Now:** Brightened to `--ok #5BD891` and `--danger #FFA0A0` for AAA contrast on navy. Added `--alert-red #A02418` as a separate token for danger fills on sand cards (different contrast requirement — needs to support cream text at 7:1).
- **Why:** WCAG AAA audit found the original status colors failed 7:1 on navy; new threat-banding feature needed a red that worked as a card fill (sand surface) which the navy-bg `--danger` couldn't.

### 2026-04-18 — Stale rows: surface-color, not opacity
- **Was:** `.ais-row--stale { opacity: 0.55 }`.
- **Now:** `.ais-row--stale { background: var(--surface-sand-stale) }` (dim sand `#D8D0BC`).
- **Why:** Opacity dropped text contrast through the AAA floor. Pre-darkened sand preserves contrast while still visually demoting stale rows.

### 2026-04-18 — Hard corners everywhere
- **Was:** Tabs 6px radius, filter toggle 8px, fix-indicator 3px, AIS cards 10px.
- **Now:** Every surface `border-radius: 0`. Includes interactive chrome (tabs, filter toggle).
- **Why:** Operator wanted the brutalist datasheet aesthetic to be uniform. Earlier compromise (rounded UI controls, hard data cards) felt half-committed.

### 2026-04-18 — Split-view default
- **Was:** Two-mode tab system (AIS / Chart) with one page visible at a time.
- **Now:** Three-mode toggle (Split / AIS / Chart), defaults to Split. Both columns always rendered; CSS `display:none` controls visibility.
- **Why:** Marine nav use needs chart + traffic both visible most of the time. Mode toggling preserves state because columns aren't unmounted.

### 2026-04-18 — Plain-language UI principle
- **Was:** AIS rows were numeric/jargon readouts (`Dist 0.2nm · Brg 045° · SOG 12.8kn · COG 230°`).
- **Now:** Narrative summary (`5 miles to your northeast, moving away at 13 knots (15 mph)`). Raw facts demoted to a small mono line.
- **Why:** Operator wants glanceable, learnable display — marine-canonical units stay visible (knots, nm) but English translation lets a learning user develop intuition.
