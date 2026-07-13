# DESIGN.md — navigation-project

Last updated: 2026-07-13

## Design Intent

**GATOR** — marine navigation app for a 1978 Sisu 22 (small diesel power boat, shallow-draft, coastal Maine). **Runs as an offline PWA on an iPhone at the helm — that's the platform.** A Raspberry Pi 4 kiosk (adds hardware AIS) is a possible future install of the same codebase, not the current deployment. Operator is one person at the helm reading the screen with possibly wet hands, in glare, while underway. Optimize for **glanceability** and **honesty** about data quality.

## Design Principles

1. **Plain-language over jargon.** Narrative summaries first, raw numbers secondary. The screen reads like a person describing the scene, not a sensor dump. This now extends beyond AIS rows to the depth story, the ship's log, and the VHF call script.
2. **Marine-canonical units with English translation in parens.** `13 knots (15 mph)`, `650 meters (711 yards)`, `3.2 nautical miles (3.7 miles)`.
3. **Honest data display.** Stale, invalid, or partial data is shown but visually distinct. Estimated tide is *never* presented as a live depth ("Tide unknown" instead). Bad data never drives alarms. **Silence over filler** — narrative surfaces say nothing rather than "all clear."
4. **Datasheet brutalism.** Hard rectangles, navy borders, no shadows (5 functional exceptions: focus sandwich + threat/keypad inset bars), no hover lifts, minimal motion. The aesthetic is marine instrument, not SaaS dashboard. Audited 2026-07 against the `avoid-ai-slop` skill: passes; texture/gradient/animation suggestions deliberately rejected ("intentionality, not intensity").
5. **WCAG 2.2 AAA by default.** Contrast ≥7:1, targets ≥44px (underway controls bigger — see Spacing), reduced-motion honored (one safety exemption).
6. **Color is semantic, not decorative.** Orange = own boat (including its track history); electric blue = AIS vessel name; amber = caution; red = danger; yellow-green = waypoints/own-ship accent.

## Visual Language

### Color Palette

Source of truth: `:root` in `src/styles/app.css` (day) and `:root[data-theme='night']` in `src/theme/night.css`. Night is a hand-tuned red-spectrum palette (dark adaptation), plus a `brightness(var(--night-brightness, 0.4))` filter scoped to `<main>` so alarm flashes keep full intensity.

| Role | Token | Day | Night |
| --- | --- | --- | --- |
| Body / app bg | `--bg-navy` | `#142038` | `#0D0000` |
| Card surface | `--surface-sand` | `#F0EBE0` | `#2D1010` |
| Card surface (stale) | `--surface-sand-stale` | `#D8D0BC` | `#1A0808` |
| Text on navy | `--text-primary` | `#F0EBE0` | `#E89A89` |
| Text on sand | `--text-on-card` | `#142038` | `#E89A89` |
| Text dim on navy | `--text-dim` | `rgba(240,235,224,0.78)` | `rgba(232,154,137,0.88)` |
| Text dim on sand | `--text-on-card-dim` | `rgba(20,32,56,0.82)` (0.88 on stale sand) | `rgba(232,154,137,0.95)` |
| Own boat + track | `--boat-icon` | `#FF6B35` | `#FF4422` |
| Own boat accent | `--ownship-accent` | `#CCFF00` | `#FFAA44` |
| AIS vessel name | `--vessel-name` | `#0F0298` | `#FF8866` |
| Caution | `--alert-amber` | `#E8B84D` | `#FFBB44` |
| Danger fill on sand | `--alert-red` | `#8B1E12` (holds 7:1 with cream text) | `#FF6644` |
| Waypoints | `--waypoint` | `#CCFF00` | `#AA6655` |
| GPS OK | `--ok` | `#5BD891` | `#88CC88` |
| GPS no-fix | `--danger` | `#FFA0A0` | `#FF6644` |
| Focus ring | `--focus-ring` | `#E8B84D` | `#FFBB44` |
| Depth bands | `--depth-shallow/mid/deep` | `#FF3B1A` / `#FFD700` / `#6FECB0` | not overridden (deliberate — safety colors stay put; the main filter dims them) |

Navaid palette (`--navaid-*`) has full day + night sets in the same two files. MapLibre paint can't read CSS vars — layer modules resolve tokens at layer-add time via `cssVar()`/`marineToken`; a theme flip without a style reload keeps the add-time color (the night brightness filter covers dimming).

### Typography

| Role | Font | Notes |
| --- | --- | --- |
| Everything narrative/labels/numerals | Zalando Sans Expanded (variable) | Self-hosted via `@fontsource-variable`. Weights 400–800; display numerics use `tabular-nums`. |
| Coordinates, raw AIS facts, keypad digits, scale bar, meta lines | IBM Plex Mono | Self-hosted via `@fontsource` (400/500). Replaced Roboto Mono 2026-07 (avoid-ai-slop blacklist); slightly wider — check StatusBar Position fit when changing those styles. |
| On-chart tile labels | Noto Sans Bold | Self-hosted PBF glyphs (`public/fonts/`), MapLibre glyph stack — unrelated to `--font-mono`. Decision: stays (hosting a second glyph stack buys nothing). |

Always reference `--font-sans` / `--font-mono`, never hardcode families. Zero CDN at runtime (`scripts/verify-offline.mjs` enforces).

### Spacing & Touch Targets

- Base unit 8px. AIS panel/card padding 16px (12px compact). Cards stack full-width, vertically — no grid.
- **Touch floor is 44px (AAA); underway controls sit above it**: StatusBar tabs 56px, AIS filter buttons 56px, alarm Acknowledge **64px** (pressed under stress on a moving deck), keypad keys 64–72px, map controls 48px, waypoint rows 56px. Landscape-short phones (`max-height: 500px`) drop tabs/filter back to 44px so the chart keeps height.
- Chart markers (AIS/waypoint/route-via) are real 44×44 buttons; navaid symbol taps get a 44×44 hit bbox via `queryRenderedFeatures`.

### Motion

Four animations, all functional, none decorative:

1. Heading glyph rotation (0.3s) — killed under reduced-motion.
2. Own-ship pulse ring (2s, 4s at night) — static halo under reduced-motion.
3. SlidePanel slide-in (250ms) + overlay fade (200ms) — skipped under reduced-motion.
4. Alarm banner flash (1 Hz) — **exempt** from reduced-motion (safety signal, under the 2.3.1 three-flash cap).

A global `prefers-reduced-motion` block forces everything else to 0.01ms. Adding motion to a new component requires explicit justification.

## Chart Overlay Priority

Rule: **safety > navigation > weather > housekeeping.** The top-right `chart-overlay-stack` order in `ChartCanvas.tsx` IS the priority: RouteTidePill → SafeReturnPill → WeatherPill. On phones CSS shows only the first two (`:nth-child(n+3) { display: none }`); dismissing one surfaces the next. Navigation widgets live outside the stack (DestinationWidget top-right above it; RouteBuildPill / DepthStoryPill bottom-center, mutually exclusive); housekeeping pills (chart download, compass enable) sit bottom-left, phone build only.

## Component Inventory

Shared substrate: **SlidePanel** (bottom sheet — `role="dialog"`, focus trap, Escape/overlay/swipe-down dismiss, reduced-motion aware) and **OverlayPill** (chart pill shell with session-keyed dismiss ×).

### StatusBar (`src/statusbar/`)
Two rows: chrome (vessel + GPS pill + almanac | tabs + theme + waypoints + settings + MOB) over readings (POSITION · SPEED · HEADING, label-inline). Heading glyph hides when GPS is stale/no-fix (honesty). Tabs 56px; all icon buttons 44px.

### Almanac / ClockSunTide (`src/statusbar/ClockSunTide.tsx`)
`2:32 PM · ☀↘ 7:47 PM · 〰↗ Castine · High 4:15 PM`. Real NOAA hi/lo predictions bundled per year (`public/tides/`), cosine-interpolated, station picked by proximity; estimate state dims the pill and prefixes `~`. 1-minute cadence.

### AIS list (`src/ais/`)
Threat-band sort (danger → caution → monitor, then distance). Vessel rows are **full-card buttons** (`.ais-row__btn`, padding moved inside so the tap target is edge-to-edge) opening the shared detail panel; hazard rows stay non-interactive. Stale rows use dimmer sand surface (not opacity). Filter All/Active; relay status strip; three distinct empty states.

### Vessel detail panel (`src/ais/VesselDetailHost.tsx` + `src/chart/detail/AISDetailPanel.tsx`)
Opened by list rows AND chart markers via `vesselSelectionStore` (context string only — copy-on-write safe, panel live-updates, self-closes if the vessel is evicted). Content: threat pill, name, narrative, raw facts, and the **"Radio call — channel 16"** block: correctly-phrased VHF hail (callee ×2, own boat name, own position from the target's perspective, spoken degrees-decimal-minutes readback). Missing boat name → placeholder + "Set your boat name in Settings" hint; missing positions omit lines rather than guess.

### Chart (`src/chart/`)
MapLibre GL, fully offline (local PMTiles base + NOAA overlay, self-hosted glyphs/sprites). Tide-aware depth contours; navaid sprites with day/night sheets; marine/harbor mode; free-pan with drift-indicating Recenter button; fiducial corner brackets. Markers: own-ship triple design (orange triangle + pulse + heading vector), **dotted orange track line** (breadcrumbs, gap-split >30 min/>1 nm, toggle in Layers panel), AIS chevrons/circles by threat band, waypoints, route + vias, anchor circle, MOB.

### Tap-for-depth story (`src/chart/hooks/useDepthTaps.ts` + `DepthStoryPill`)
Tap open water → nearest rendered spot sounding (60px radius), else nearest depth contour (22px) → bottom-center pill: "About 12 ft here now / Charted 4 ft at low water + 8.2 ft of tide" (tide taken at the tap position). Estimated tide → "Tide unknown", charted figure only — never a computed depth. Yields to navaid taps and pick modes; nothing found → clears silently. Below zoom 12 soundings aren't rendered, so most taps resolve via contours or nothing (documented limitation; revisit wording after the on-water test).

### Ship's log (`src/logbook/`)
Auto-generated narrative day entries from breadcrumbs + dwell detection + a persisted action-event store (MOB, anchor set/clear, waypoint saves — recorded at the action sites; the session stores stay ephemeral). "Moored Castine mooring 5:00 AM · 4 hr / Departed 9:12 AM / Distance run 14.2 nautical miles (16.3 miles)". Stops near a saved waypoint borrow its name; otherwise honest coordinates. Opens from Waypoints panel; per-day Share (Web Share → clipboard fallback). Forward-only from install date.

### Waypoints & routes (`src/waypoints/`)
WaypointsPanel: Save current position, Ship's log, Suggested-from-track (dwell detection), Saved (kebab → action sheet), Recent. Categories mooring/anchorage/hazard/poi. Multi-pin route building via armed drop-pin taps; DestinationWidget with bearing/distance/ETA; coordinate entry via long-press (keypad).

### Anchor watch (`src/anchor/`), MOB (`src/statusbar/MOBButton.tsx`), Alarm banner (`src/ui/AlarmBanner.tsx`)
Anchor: radius presets 50/75/100 ft, optional charted depth (enables drying alert), amber circle, drag alarm. MOB: two-tap confirm (or M-O-B key sequence), drops waypoint + route + alarm, button becomes "MOB ACTIVE — CLEAR". Alarm banner: single-slot store, full-bleed 1 Hz flash + `role="alert"`; Acknowledge (64px) stops the flash, condition owns the clear. Episode semantics regression-tested.

### Weather (`src/weather/`), Safe return + route tide (`src/safety/`)
WeatherPill: NWS next-6-hr verdict vs operator wind limit, freshness dot, stale wording. SafeReturnPill: daylight left · ETA home · depart-by (needs home mooring set). RouteTidePill: passage-window tide check with "Safe until/from". All honest-degrade; stale data never asserts.

### Settings + Help (`src/statusbar/Settings*`), Keypad (`src/ui/MarineKeypad.tsx`), PWA download (`src/pwa/`)
Settings: boat name, hull dims, safety margin, cruise speed, home mooring, wind limit, internet-AIS key, heading source; single Save with flash. Help: icon glossary, on demand (no first-run tour — single-operator kiosk). Keypad: bottom-docked marine keyboard, 64–72px keys, recents chips. ChartDownloadPill: phone-only chart caching with progress/error/retry.

### Theme (`src/theme/`)
Day/night/auto (civil twilight via suncalc at GPS position). Night = token overrides + main-scoped brightness filter + warm navaid sprite sheet.

## Layout & Navigation

Single-page, no router. Three view modes from StatusBar tabs: **Split** (default; AIS 30% clamped 260–400px | chart 70%), **AIS only** (max 720px centered), **Chart only**. Both columns always in the DOM (`display: none` toggling preserves state); a ResizeObserver keeps MapLibre sized. Vessel detail panel is app-level so it works in every mode.

## Key Screens

- **Split** — primary underway view: traffic + chart side by side.
- **AIS only** — traffic scan, raw facts, radio-call prep (tap a row).
- **Chart only** — maximum chart for tight water; depth taps + track review.

## Research & Evidence

- Operator profile (project owner) — single user; n=1 by design.
- Marine domain conventions + WCAG 2.2 AAA audit (re-verified 2026-07).
- Skills audit 2026-07-13 (`avoid-ai-slop`, `ui-ux-complete`, `full-stack-team`): findings + remediation in `~/.claude/plans/if-you-were-to-concurrent-whale.md`.
- **On-water usability protocol** for the phone smoke test lives in `docs/phone-test.md` — structured tasks with success criteria replace an unstructured "does it work" ride.

## Accessibility Approach

WCAG 2.2 **AAA**. Every text/surface pairing computed ≥7:1 (both themes); targets ≥44px with underway controls at 56–64px; 3px amber focus ring with navy sandwich rings; `prefers-reduced-motion` honored (alarm-flash exemption documented); semantic landmarks; `aria-pressed`/`aria-haspopup`/dialog wiring.

## Open Design Questions

- [ ] **Chart-on-right vs chart-on-left** in split view. Still right; decide after helm time on the water.
- [ ] **Compact-card density** in split view — two-line condensed format or top-N expanded?
- [ ] **Filter toggle location** — above list or StatusBar?
- [ ] **Vessel mark / monogram** for own-boat — brand element in `--boat-icon` orange, reusable as favicon.
- [ ] **Depth-tap dead taps** — empty water below zoom 12 gives no feedback (honest silence). If it tests badly on the water, switch to "No charted depth here."

## Design Change Log

### 2026-07-13 — Skipper line removed

- **Was:** A situation-summary strip above the chart (threat → daylight → wind), added earlier the same day from the skills audit.
- **Now:** Removed entirely (`src/skipper/` deleted; chart layout reverted).
- **Why:** Operator call after trying it: redundant with split view — the AIS list already narrates threats right beside the chart — and on the phone build (no AIS receiver) the threat segment can never fire, leaving a strip that mostly restates the almanac while costing chart height. The plain-language wedge lives on in the AIS narrative, depth story, ship's log, and VHF script.

### 2026-07-13 — App renamed: Sisu Nav → GATOR

- **Was:** "Sisu Nav" in the PWA manifest, `<title>`, iOS home-screen label, and README.
- **Now:** "GATOR" everywhere the *app* is named. The StatusBar nameplate still shows the operator's boat name from Settings — that's vessel identity, not branding.
- **Why:** Operator decision. Also unblocks the open monogram/favicon question with a nameable identity. Installed phones pick up the new name on next PWA update/reinstall.

### 2026-07-13 — Skipper line drops the tide segment

- **Was:** Skipper line segments were threat → tide ("Tide falling, low 4:15 PM") → daylight → wind.
- **Now:** threat → daylight → wind. Tide removed entirely.
- **Why:** Operator feedback on first look — the StatusBar almanac icon already shows tide direction and next-event time, so the strip was repeating the chrome one inch below it. Redundancy costs the length budget that daylight/wind need.

### 2026-07-13 — Skills-audit remediation (avoid-ai-slop + ui-ux-complete)

- **Was:** Roboto Mono for numerics; 44px floor on all controls; AIS rows non-interactive `<li>`s with link-blue names (open question m1); vessel detail only from chart markers, frozen at tap time; overlay pills stacked in arbitrary JSX order; breadcrumbs recorded but never drawn; narrative principle confined to AIS rows; free-pan documented as "deferred" though shipped.
- **Now:** IBM Plex Mono (self-hosted); tabs/filter 56px + Acknowledge 64px with a landscape-short carve-out (resolves m2); whole AIS card is a button sharing a live-updating detail panel with chart markers (resolves m1 — the blue name affordance is now real); documented pill priority (safety > navigation > weather > housekeeping) with a phone cap of two; dotted orange track line + auto ship's log; skipper line strip; tap-for-depth story; VHF radio-call script in the detail panel; free-pan/Recenter documented as built. Chart glyph question closed: Noto Sans Bold stays.
- **Why:** Audit against the newly added skills. Differentiation thesis: commercial plotters are data-dense instrument panels — this is *the plotter that talks like a deckhand and never lies about data quality*. Rejected the skills' texture/gradient/animation suggestions: restraint IS the datasheet aesthetic.

### 2026-07-11 — Full audit remediation (alarm semantics, tide honesty, module refactors)

- **Was:** kind-blind alarm clears; negative tides couldn't drive alarms; DepthLegend double-counted tide.
- **Now:** per-kind clear discipline + episode semantics with regression tests; signed tide math verified against NOAA/Vincenty with a 5-layer redundancy suite.
- **Why:** External math + systems audit; safety-critical paths get independent verification.

### 2026-04-20 — StatusBar: single-row → deliberate two-row layout

- **Was:** One flat flex row; natural width ~1500px; wrap placed Heading alone on a centered second row.
- **Now:** Row 1 chrome / row 2 readings with 1px divider; type pass (label 10px, value 15px, mono 13px).
- **Why:** Operator screenshot showed unpredictable wrapping at 1024px; two deliberate rows match the marine-instrument "identity strip + data strip" model.

### 2026-04-19 — Own-ship triple design

- **Was:** 28px orange triangle, no pulse, no heading vector.
- **Now:** 40px triangle + 2px `--ownship-accent` outline, pulsing ring (the app's only looping animation), 1-minute heading-vector line.
- **Why:** Own-ship must be unmissable on any background and convey movement intent without mental math.

### 2026-04-19 — Chart library: Leaflet → MapLibre GL

- **Was:** Leaflet + OSM raster tiles.
- **Now:** raw `maplibre-gl`, vector tiles, per-layer marine palette. (Base later moved fully offline — local PMTiles, self-hosted fonts/sprites, zero CDN.)
- **Why:** Raster tiles can't be restyled to the marine palette.

### 2026-04-19 — NOAA chart pipeline (depth contours, buoys, lights)

- **Was:** No real chart features.
- **Now:** NOAA ENC → self-hosted PMTiles (`scripts/build-charts.sh`); depth contours colored by `VALDCO` (red <6ft, gold 6–20ft, green >20ft).
- **Why:** Real navigation needs real depth data; single-file PMTiles ships to Pi and phone alike.

### 2026-04-18 — Threat-banding color extension

- **Was:** `--ok #4fbf7a` / `--danger #e05a5a`; one red for everything.
- **Now:** Brightened `--ok`/`--danger` for AAA on navy; separate `--alert-red` for fills on sand (later darkened #A02418 → #8B1E12 to hold 7:1 with cream text).
- **Why:** AAA audit failures; a fill red and a text red have different contrast jobs.

### 2026-04-18 — Stale rows: surface-color, not opacity

- **Was:** `opacity: 0.55`.
- **Now:** dim sand `--surface-sand-stale` (+ dim-ink alpha bump to 0.88 on that surface).
- **Why:** Opacity dropped text contrast below AAA.

### 2026-04-18 — Hard corners everywhere

- **Was:** Mixed radii (tabs 6px, cards 10px…).
- **Now:** `border-radius: 0` on every surface.
- **Why:** A half-committed brutalist aesthetic reads as accident, not intent.

### 2026-04-18 — Split-view default

- **Was:** Two-mode tab system, one page at a time.
- **Now:** Split / AIS / Chart, defaulting to Split; columns stay mounted.
- **Why:** Underway you want traffic and chart simultaneously; unmounting lost state.

### 2026-04-18 — Plain-language UI principle

- **Was:** `Dist 0.2nm · Brg 045° · SOG 12.8kn · COG 230°`.
- **Now:** "5 miles to your northeast, moving away at 13 knots (15 mph)" with raw facts demoted to a mono line.
- **Why:** Glanceable and learnable beats dense and expert-only; marine units stay for radio calls.
