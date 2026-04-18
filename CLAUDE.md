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
- **Map library: Leaflet.** Raster NOAA charts (MBTiles), touchscreen-friendly, huge plugin ecosystem, minimal learning curve. Not added to deps yet — ChartPage isn't built.
- **No depth, wind, or heading in v1** — no sensors for them.

## Project structure

```
src/
├── signalk/         # WebSocket client, React hook, mock data
├── components/      # Presentational (AISList, Gauge, StatusBar, ...)
├── pages/           # Route-level views (AISPage, ChartPage later)
└── styles/
public/
└── charts/          # DO NOT put MBTiles here — serve from disk on Pi
```

## Principles

- **Mock data must be messy.** Real AIS is noisy: vessels with no name, no course, stale timestamps, missing fields, implausible coordinates. If the mock only produces clean data, the UI breaks on first contact with real bay traffic. The mock generator in `src/signalk/mockData.ts` intentionally produces a variety of broken/partial vessel states.
- **Plain-language UI.** Primary text is narrative rather than numeric/jargon readouts. Raw numbers stay visible but secondary. Bearings are relative to own heading (bow/port/starboard/stern) when known. **Every primary unit is marine-canonical with a plain-English translation in parentheses** — speed shown as `13 knots (15 mph)`, distance as `650 meters (711 yards)` under 1 nm or `3.2 nautical miles (3.7 miles)` beyond. Rows split onto separate lines: name, location, movement, qualifier (if any), raw facts.
- **Ship thin.** v1 is ChartPage + AISPage. No InstrumentsPage until there are instruments. Position/SOG/COG go in StatusBar.
- **Don't bundle chart tiles.** MBTiles are gigabytes. On the Pi, serve from disk via SignalK's chart plugin or a tiny local tile server. `public/charts/` is a placeholder, not a delivery path.

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
- `--alert-amber` `#E8B84D` — amber. Stale/caution indicators, qualifier lines, `GPS stale` fix indicator.
- `--waypoint` `#6B9080` — sage. Reserved for future waypoints / route markers.
- `--ok` `#4fbf7a` / `--danger` `#e05a5a` — universal green/red signals for system status (GPS OK / no fix). Distinct from the brand palette; don't repurpose.

**Interactive**
- `--focus-ring` `#E8B84D` — amber, 2px, applied via `:focus-visible`.

**Pattern: navy app chrome + sand information cards.** Any readable data payload (AIS rows, instrument cards, route entries) goes on sand. Status/chrome/navigation (StatusBar, tabs, chart canvas bezel) stays on navy. Active tabs flip to sand fill to signal "you are reading this content."

## Accessibility — WCAG 2.2 AAA

This project targets **WCAG 2.2 Level AAA**. Apply by default — don't ship UI changes that knowingly violate it.

Key constraints AAA imposes that bite hardest in this UI:
- **Contrast 7:1** for normal text, 4.5:1 for large (≥18pt regular / 14pt bold). Verify every new text-on-surface pairing in the navy/sand palette.
- **Touch targets ≥44×44 CSS px** (AAA, stricter than AA's 24×24). Tabs, buttons, any clickable row.
- **Focus indicator ≥2px perimeter, 3:1 contrast change**, fully visible (not obscured by sticky StatusBar). Currently `--focus-ring` amber 2px via `:focus-visible`.
- **No `user-scalable=no`** in viewport meta — kiosk pinch-zoom must work for low-vision use.
- **Plain language at lower-secondary reading level** (AAA 3.1.5) — already aligned with the "plain-language UI" principle above.
- **Motion/animation can be disabled** — respect `prefers-reduced-motion` for the heading-glyph rotation transition and any future map animations.
- **Semantic landmarks** — `<main>`, `<nav>`, `<header>` etc., not raw `<div>` chrome.

Run `/wcag` to audit before any visible release.

## Status

Scaffolded: SignalK client, mock generator, `useSignalK` hook, AISList component, AISPage.
Not yet built: ChartPage, StatusBar, Leaflet integration, real-Pi testing.
