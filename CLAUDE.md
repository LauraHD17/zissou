# navigation-project

Navigation UI for a Raspberry Pi 4 running on a 1978 Sisu 22 (diesel inboard, centerboard). Shallow-draft coastal use — depth awareness matters more than wind. React + TypeScript + Vite frontend that subscribes to a SignalK server over WebSocket.

## Hardware

- **Raspberry Pi 4** running OpenPlotter (Raspberry Pi OS + SignalK + OpenCPN preinstalled).
- **u-blox USB GPS dongle** — appears as `/dev/ttyACM0`. Feeds `navigation.position`, `navigation.speedOverGround`, `navigation.courseOverGroundTrue`.
- **dAISy HAT** — AIS receiver on the GPIO UART (`/dev/serial0`). Requires Linux serial console disabled via `raspi-config` → Interface Options → Serial Port → "login shell: No, serial hardware: Yes".
- **Standalone depth finder** — not wired into the Pi for v1.

## Architecture

- **SignalK** is the data bus. The Pi runs `signalk-server` (port 3000, `ws://localhost:3000/signalk/v1/stream`). Everything in the React app is a subscriber.
- **Dev on laptop, run on Pi.** The SignalK client has a mock mode for laptop development. Switch via `VITE_SIGNALK_MODE=mock|real` env var. The mock emits the same delta shape as the real server so the reducer is identical.
- **Map library: Leaflet.** Raster NOAA charts (MBTiles), touchscreen-friendly, huge plugin ecosystem, minimal learning curve. Dev uses OSM tiles via the public CDN; production switches to a local MBTiles tile server on the Pi.
- **No depth, wind, or heading in v1** — no sensors for them.

## Project structure

```
src/
├── signalk/         # WebSocket client, React hook, mock data
├── components/      # Presentational (AISList, Gauge, StatusBar, ...)
├── pages/           # Route-level views (AISPage, ChartPage)
├── utils/           # Pure helpers (formatters, geometry)
└── styles/
public/
└── charts/          # DO NOT put MBTiles here — serve from disk on Pi
```

## Layout

Three view modes, toggled from the StatusBar:

- **Split (default)** — AIS list at 30% width on the left, Chart at 70% on the right. Designed for a 7–10" Pi touchscreen (1024×600 typical). AIS column clamps `min-width: 260px` / `max-width: 400px` so cards stay readable.
- **AIS only** — full-width AIS list, max 720px centered.
- **Chart only** — full-width chart.

In split mode, the AIS list renders with `compact={true}` → applies `.ais-panel--compact`, which drops the dense raw-facts mono line and tightens typography for the narrow lane. The full row design returns in AIS-only mode where there's room for it. Both columns always render in the DOM; CSS `display: none` controls visibility per mode so component state (filter, scroll) survives toggling.

## Principles

- **Mock data must be messy.** Real AIS is noisy: vessels with no name, no course, stale timestamps, missing fields, implausible coordinates. If the mock only produces clean data, the UI breaks on first contact with real bay traffic. The mock generator in `src/signalk/mockData.ts` intentionally produces a variety of broken/partial vessel states.
- **Plain-language UI.** Primary text is narrative rather than numeric/jargon readouts. Raw numbers stay visible but secondary. Bearings are relative to own heading (bow/port/starboard/stern) when known. **Every primary unit is marine-canonical with a plain-English translation in parentheses** — speed shown as `13 knots (15 mph)`, distance as `650 meters (711 yards)` under 1 nm or `3.2 nautical miles (3.7 miles)` beyond. Rows split onto separate lines: name, location, movement, qualifier (if any), raw facts.
- **Ship thin.** v1 is ChartPage + AISPage. No InstrumentsPage until there are instruments. Position/SOG/COG go in StatusBar.
- **Don't bundle chart tiles.** MBTiles are gigabytes. On the Pi, serve from disk via SignalK's chart plugin or a tiny local tile server. `public/charts/` is a placeholder, not a delivery path.

## Chart (`src/components/ChartCanvas.tsx`)

Leaflet via `react-leaflet@^4` (v5 requires React 19; we're on 18). Renders a tile map with own-ship marker + AIS target markers + auto-recenter.

**Tile source:** OpenStreetMap CDN for laptop dev. Production on the Pi switches to NOAA raster MBTiles served by a local tile server (deferred — needs Pi setup). Note: OSM doesn't show marine depth contours / chart features; production-only concern.

**Own-ship marker:** divIcon SVG triangle in `--boat-icon` orange, navy stroke, rotates with COG (smooth `transition: transform 0.3s` — disabled under `prefers-reduced-motion`).

**AIS markers:** divIcon SVG, colored by threat band (`--surface-sand` monitor / `--alert-amber` caution / `--alert-red` danger). Targets with COG render as oriented chevrons; targets without (e.g. anchored) render as circles. Stale targets get 0.55 opacity.

**Auto-recenter:** `<AutoRecenter>` calls `map.setView()` whenever own-ship position updates. v1 always recenters — no free-pan mode yet (deferred; needs a "user has manually panned" detection + a "Recenter" button).

**Resize handling:** `<ResizeObserverBridge>` watches the map container and calls `map.invalidateSize()` when CSS `display: none` toggling (mode switches between split / chart-only) changes the visible size. Without this Leaflet caches the wrong size and tiles don't fill correctly after a mode toggle.

**Leaflet UI overrides:** in `app.css` — zoom controls and attribution restyled to match the brutalist aesthetic (hard rectangles, sand fill, navy text). Don't unset these or the chart breaks the design language.

## StatusBar — clock, sun, tide

The StatusBar's left section includes a glanceable time + sun + tide cluster (inlined in `src/components/StatusBar.tsx` as the `ClockSunTide` sub-component). Format: `2:32 PM · ☀↘ 7:47 PM · 〰↗ High 4:15 PM`.

- **Time** — 12-hour, ticks at 60-second cadence (`src/utils/clock.ts`).
- **Sun** — `suncalc` library, fully offline, takes lat/lon from `useSelf()` (falls back to mid-coast Maine when no fix yet). See `src/utils/sun.ts`.
- **Tide** — **STUB** in `src/utils/tides.ts`. Currently a single-constituent M2 (12.42-hour) cycle anchored to an arbitrary reference high tide. Plausible-looking but **not a real forecast**. Replace with NOAA harmonic constants for Penobscot Bay before sailing season — two paths:
  1. NOAA Tides & Currents API (`api.tidesandcurrents.noaa.gov`) — pre-fetch predictions for next N days, cache locally, refresh when online.
  2. Compute from harmonic constants directly (libraries: `tidey`, `harmonic-tide`). Constants for Bar Harbor / Castine / Bangor downloadable from NOAA.
  
  When swapping in real data, only `nextTideEvent()` needs to change — UI consumes the same `TideEvent` interface.

## AIS threat banding

`computeThreatBand()` in `src/utils/formatters.ts` returns `'monitor' | 'caution' | 'danger'` for each AIS target. Coarse heuristic, not full CPA/TCPA — enough to surface "things to worry about" without alarm fatigue. Conservative: missing/stale data always returns `monitor` so bad data never drives warnings.

Thresholds:
- **danger** — within 200m (any motion), OR within 0.5 nm and closing in <3 min
- **caution** — within 1 nm closing in <8 min, OR within 2 nm closing in <15 min, OR within 500m without motion data
- **monitor** — everything else (no UI treatment, default sort by distance)

`AISList` sorts by band first (danger → caution → monitor), then by distance within each band. Caution rows get an 8px amber left bar (inset shadow); danger rows get an 8px red left bar; both get an uppercase pill at the top of the card. When CPA/TCPA proper math is added, replace the heuristic in this one function — the UI layer doesn't need to change.

## Data units on the wire

SignalK streams SI units: `navigation.speedOverGround` is **meters per second**, angles in radians or degrees depending on path (COG/heading can vary — SignalK v1 spec says radians, but many plugins emit degrees; we normalize on ingest). The store holds raw SignalK values; conversion to display units (knots, mph, statute miles, compass degrees) happens only in formatters at the render layer.

## Running

```bash
# Laptop dev (mock data)
npm run dev

# On the Pi (real SignalK)
VITE_SIGNALK_URL=ws://localhost:3000/signalk/v1/stream \
VITE_SIGNALK_MODE=real \
npm run dev
```

## Deferred (priority order)

1. **Depth into SignalK** — high value given the centerboard + shallow-draft profile. Requires upgrading the standalone depth finder to one with NMEA 0183 output, then wiring into the Pi via a USB-serial adapter. Unlocks a depth readout in StatusBar and a configurable shallow-water alarm.
2. **Boat heading** — GPS COG is not heading (differ when drifting/anchored/against current). Needs a compass/AHRS. Matters for accurate chart orientation at slow speeds.
3. **Self-host fonts** — currently loading Zalando Sans Expanded + Roboto Mono from Google Fonts CDN (`index.html`). The boat won't always have internet; before Pi install, switch to `@fontsource/zalando-sans-expanded` + `@fontsource/roboto-mono` (or equivalent) so fonts ship in the bundle.
4. **Kiosk autostart on Pi** — `chromium --kiosk` via systemd.
5. **Engine telemetry** (RPM, coolant temp, fuel) — requires NMEA 2000 bus + engine gateway. Not planned.
6. **Wind** — low priority for a power boat. Possible if cruising in exposed water and sea state prediction matters.

## Typography

- **Zalando Sans Expanded** (sans) — primary family for headings, labels, button text, vessel names (600–700); body text (400–500); large display numerics like speed/heading (700–800 with `font-variant-numeric: tabular-nums`).
- **Roboto Mono** — reserved for coordinates, distance values, and any readout where numeric width consistency matters (lat/lon in StatusBar, raw-facts line in AIS rows).
- CSS variables: `--font-sans`, `--font-mono`. Always reference the variables, never hardcode the family.

## Design system — colors

Palette lives in `:root` of `src/styles/app.css`. Always reference variables, never hardcode hex values.

**Base surfaces**
- `--bg-navy` `#142038` — deep navy. Body bg, StatusBar.
- `--surface-sand` `#F0EBE0` — sand. AIS rows and any "card" surface sitting on navy.

**Text**
- `--text-primary` `#F0EBE0` — cream, used on navy surfaces.
- `--text-on-card` `#142038` — navy, used on sand surfaces.
- `--text-dim` / `--text-on-card-dim` — 60%-ish opacity variants for secondary labels.

**Functional / semantic**
- `--boat-icon` `#FF6B35` — safety orange. Reserved for **our own vessel** (heading glyph, own-ship marker on chart). Don't use for anything else.
- `--vessel-name` `#0F0298` — electric blue. Used **only** for AIS vessel names.
- `--alert-amber` `#E8B84D` — amber. Stale/caution indicators, qualifier lines, threat-band caution bar/pill, `GPS stale` fix indicator.
- `--alert-red` `#A02418` — deep red for threat-band danger fills on sand cards (cream text on it ≥7:1). Distinct from `--danger` (which is for status text on dark navy).
- `--waypoint` `#6B9080` — sage. Reserved for future waypoints / route markers.
- `--ok` `#5BD891` / `--danger` `#FFA0A0` — universal green/red signals for system status text on navy (GPS OK / no fix). Brightened to pass AAA on the navy bg. Distinct from the brand palette; don't repurpose.

**Interactive**
- `--focus-ring` `#E8B84D` — amber, 3px outline + 2px offset via `:focus-visible`.

**Pattern: navy app chrome + sand information cards.** Any readable data payload (AIS rows, instrument cards, route entries) goes on sand. Status/chrome/navigation (StatusBar, tabs, chart canvas bezel) stays on navy. Active tabs flip to sand fill to signal "you are reading this content."

**Hard rectangles everywhere.** Every surface — data cards, tabs, filter toggles, fix indicators, future buttons — uses `border-radius: 0`. No box-shadows, no transitions, no hover lifts. The look is deliberately datasheet/chart-plotter, not material/iOS. Data cards specifically use `border: 1px solid var(--bg-navy)`. Don't introduce rounded corners on new elements; they break the aesthetic.

## Accessibility — WCAG 2.2 AAA

This project targets **WCAG 2.2 Level AAA**. Apply by default — don't ship UI changes that knowingly violate it.

Key constraints AAA imposes that bite hardest in this UI:
- **Contrast 7:1** for normal text, 4.5:1 for large (≥18pt regular / 14pt bold). Verify every new text-on-surface pairing in the navy/sand palette.
- **Touch targets ≥44×44 CSS px** (AAA, stricter than AA's 24×24). Tabs, buttons, any clickable row.
- **Focus indicator ≥2px perimeter, 3:1 contrast change**, fully visible (not obscured by sticky StatusBar). Currently `--focus-ring` amber 3px outline + 2px offset via `:focus-visible`.
- **No `user-scalable=no`** in viewport meta — kiosk pinch-zoom must work for low-vision use.
- **Plain language at lower-secondary reading level** (AAA 3.1.5) — already aligned with the "plain-language UI" principle above.
- **Motion/animation can be disabled** — respect `prefers-reduced-motion` for the heading-glyph rotation transition and any future map animations.
- **Semantic landmarks** — `<main>`, `<nav>`, `<header>` etc., not raw `<div>` chrome.

Run `/wcag` to audit before any visible release.

## Status

**Built:** SignalK client + reconnecting WebSocket; messy mock generator (9 vessel archetypes); `useSignalK` / `useSelf` / `useAISTargets` hooks; AISPage with `<h1 sr-only>`; ChartPage with Leaflet (OSM tiles) + own-ship marker + AIS threat-banded markers + auto-recenter + resize-on-mode-toggle; StatusBar with vessel name + GPS pill + clock/sun/tide cluster (centered with metric value gap) + lat/lon/speed/heading + 3-mode tabs; AISList with All/Active filter, plain-language narrative rows, threat banding (monitor/caution/danger), stale-row dim-sand surface, compact variant for split mode; navy/sand brutalist palette with WCAG 2.2 AAA contrast verified; Zalando Sans Expanded + Roboto Mono via Google Fonts; split-view layout (default 30/70 AIS/chart) with mode toggle; reduced-motion + sr-only utilities; semantic landmarks + aria.

**Not yet built:** waypoints / Go-To routing (next), saved waypoints UI, anchor watch, ETA, night-vision mode, MOB button, real tide harmonic data (currently M2 stub), free-pan + recenter button on chart, NOAA MBTiles serving on Pi, depth/heading/wind sensors, kiosk autostart, self-hosted fonts, real-Pi smoke test.
