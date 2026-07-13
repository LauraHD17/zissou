# navigation-project

Navigation UI for a Raspberry Pi 4 running on a 1978 Sisu 22 (diesel inboard, centerboard). Shallow-draft coastal use — depth awareness matters more than wind. React + TypeScript + Vite frontend that subscribes to a SignalK server over WebSocket.

## Hardware

- **Raspberry Pi 4** running OpenPlotter (Raspberry Pi OS + SignalK + OpenCPN preinstalled).
- **u-blox USB GPS dongle** — appears as `/dev/ttyACM0`. Feeds `navigation.position`, `navigation.speedOverGround`, `navigation.courseOverGroundTrue`.
- **dAISy HAT** — AIS receiver on the GPIO UART (`/dev/serial0`). Requires Linux serial console disabled via `raspi-config` → Interface Options → Serial Port → "login shell: No, serial hardware: Yes".
- **Standalone depth finder** — not wired into the Pi for v1.

## Architecture

- **SignalK delta shape is the data contract.** Three client modes in `src/signalk/client.ts`, switched via `VITE_SIGNALK_MODE`:
  - `mock` — laptop development; messy synthetic fleet from `mockData.ts`.
  - `real` — SignalK server over WebSocket (the Pi; port 3000, `ws://localhost:3000/signalk/v1/stream`). Reconnects with capped exponential backoff (2 s → 30 s).
  - `geo` — the device's own GPS via the browser Geolocation API (the phone build). **Real data only — no mock AIS ever runs in this mode**; the AIS panel stays honestly empty. Geolocation heading arrives in degrees and is converted to radians at the source.
  - **Supplementary internet AIS (geo/real only, never `mock`)** — `src/signalk/aisStream.ts` + `src/ais/useInternetAis.ts` relay shore-station AIS from aisstream.io when enabled in Settings (operator's own free API key; needs cellular data). Real but **delayed and coverage-gapped**: vessels are flagged `relayed`, capped at `monitor` threat band (a possibly-minutes-old position must never fire a collision warning), labeled "via shore relay", and the AIS list shows relay connection status so an empty list while offline doesn't read as "no traffic". Wire units (knots/degrees) convert to SignalK SI at the source; a direct receiver report for the same vessel clears the flag.
- **Two deployment targets:** the Pi kiosk (`real`) and a standalone offline PWA on an iPhone (`geo`) — see [docs/phone-test.md](docs/phone-test.md). Same codebase, same charts, same features minus AIS.
- **Map library: MapLibre GL** with a fully self-contained offline style — local PMTiles for both the base map and the NOAA overlay, self-hosted fonts and sprites. Zero CDN dependencies at runtime (`scripts/verify-offline.mjs` enforces this).
- **No depth, wind, or magnetic heading** — no sensors for them yet.

## Project structure

Feature-foldered — each feature owns its components, hooks, and store:

```
src/
├── signalk/     # client (mock|real|geo), ingest store, mock data, types
├── chart/       # ChartCanvas + controls/, detail/, hooks/, markers/, style/
├── ais/         # AISList
├── pages/       # Route-level views (AISPage, ChartPage)
├── statusbar/   # StatusBar, ClockSunTide, MOB/Waypoints/Settings buttons
├── alarm/       # single-slot alarm store + audio
├── anchor/      # anchor watch (store, drag watch, button)
├── breadcrumbs/ # track recorder, dwell detector, suggested waypoints
├── waypoints/   # waypoint/route stores, panels, hazard proximity watch
├── safety/      # tide alerts, route tide pill, safe return
├── weather/     # NWS forecast fetch + go/no-go
├── prefs/       # user prefs, cruising speed
├── theme/       # day/night theme (auto via civil twilight)
├── pwa/         # offline chart download (phone build)
├── ui/          # SlidePanel, OverlayPill, AlarmBanner, ErrorBoundary, keypad
├── icons/       # SVG icon set (DOM-built, no innerHTML)
├── storage/     # defineStore/defineMemoryStore (versioned localStorage + memory)
├── utils/       # pure helpers (geometry, units, tides, threat, narrative, sun)
└── styles/
public/
├── charts/      # PMTiles (gitignored source of truth; served same-origin on
│                #  dev/Pi; published as GitHub Release assets for the phone)
├── tides/       # bundled NOAA hi/lo predictions (per year)
├── fonts/ sprites/ icons/
```

## Layout

Three view modes, toggled from the StatusBar:

- **Split (default)** — AIS list at 30% width on the left, Chart at 70% on the right. Designed for a 7–10" Pi touchscreen (1024×600 typical). AIS column clamps `min-width: 260px` / `max-width: 400px` so cards stay readable.
- **AIS only** — full-width AIS list, max 720px centered.
- **Chart only** — full-width chart.

In split mode, the AIS list renders with `compact={true}` → applies `.ais-panel--compact`, which drops the dense raw-facts mono line and tightens typography for the narrow lane. The full row design returns in AIS-only mode where there's room for it. Both columns always render in the DOM; CSS `display: none` controls visibility per mode so component state (filter, scroll) survives toggling.

## Principles

- **Mock data must be messy — and must never reach the water.** Real AIS is noisy: vessels with no name, no course, stale timestamps, missing fields, implausible coordinates. If the mock only produces clean data, the UI breaks on first contact with real bay traffic. The mock generator in `src/signalk/mockData.ts` intentionally produces a variety of broken/partial vessel states. Mock runs ONLY in `mock` mode; `real` and `geo` (the on-water modes) show real data or honest empty states — simulated vessels on a live chart could be mistaken for real traffic.
- **Plain-language UI.** Primary text is narrative rather than numeric/jargon readouts. Raw numbers stay visible but secondary. Bearings are relative to own heading (bow/port/starboard/stern) when known. **Every primary unit is marine-canonical with a plain-English translation in parentheses** — speed shown as `13 knots (15 mph)`, distance as `650 meters (711 yards)` under 1 nm or `3.2 nautical miles (3.7 miles)` beyond. Rows split onto separate lines: name, location, movement, qualifier (if any), raw facts.
- **Ship thin.** No InstrumentsPage until there are instruments. Position/SOG/COG go in StatusBar.
- **Chart tiles never go through the bundler or Pages hosting.** The PMTiles files (~300 MB) live in `public/charts/` (gitignored), are served same-origin on dev/Pi, and ship to the phone as GitHub Release assets cached on-device by the service worker (`src/pwa/chartCache.ts`). URL wiring lives in `src/chart/style/chartUrls.ts` (`VITE_CHARTS_BASE`).
- **Bad data never drives warnings.** Stale/missing/implausible input degrades to `monitor`/quiet states — spoofed AIS can't ring false alarms, and fabricated tide estimates never present as live depth (see tide `isEstimate` handling).

## Chart (`src/chart/ChartCanvas.tsx`)

**MapLibre GL** (raw `maplibre-gl`, no React wrapper — react-map-gl v7 conflicts with maplibre-gl v5 peer dep). Vector tiles + custom style for marine palette.

**Tile sources (both local PMTiles — fully offline):**

- **Base (land/water/coastline)**: `maine-base.pmtiles` via the self-contained style in `src/chart/style/offlineStyle.ts` (no OpenFreeMap/CDN — see commit c2ca835). Built by `scripts/build-base-charts.sh`.
- **NOAA chart overlay (depth contours, buoys, lights, wrecks, soundings)**: `maine.pmtiles`, layered on by `src/chart/style/marineStyle.ts`. Single-file format, no tile server — MapLibre reads it via the `pmtiles` npm package. Built from NOAA ENC data by `scripts/build-charts.sh` — see `docs/charts.md` (requires GDAL + tippecanoe, one-time setup). Files are gitignored; same files deploy to the Pi and (as release assets) to the phone.

**Depth contour styling** — depths are meters in NOAA ENC (`VALDCO` attribute). Colored via `step` expression: `#FF3B1A` for < 1.83m (6ft), `#FFD700` for 1.83–6.10m, `#6FECB0` for > 6.10m (20ft+). Labels along the line in matching color with sand halo.

**Graceful degradation** — if the PMTiles file isn't present (e.g. fresh clone before running the build script), the NOAA source fails silently and only the tinted base tiles render. App still works, just no depth data until the script runs.

**Marine palette** (in `src/chart/style/marineStyle.ts` + `offlineStyle.ts`): water → slate blue, land → sand, coastline → navy. MapLibre paint can't read CSS vars, so marker/layer modules read tokens at layer-add time via the exported `cssVar()` helper (values don't repaint on theme flip; night mode's `<main>` brightness filter covers dimming).

**Own-ship marker (triple design):** built via `createElementNS` (no `innerHTML` — XSS-safe even though our values are numeric). 40px orange (`--boat-icon`) triangle with 2px yellow-green (`--ownship-accent`) outline (rotates with COG); pulsing ring 40 → 56px over 2s (`--ownship-pulse` token, red-spectrum at night; static halo under `prefers-reduced-motion`); heading vector rendered as a GeoJSON `LineString` source + `line` layer (`--ownship-accent`, weight 2).

**AIS + waypoint markers are real `<button>`s** (44×44 hit area, aria-labels, keyboard focusable — AAA 2.5.5/2.1.1). Threat band drives className (`ais-target-marker--monitor/caution/danger`); targets with COG render as oriented chevrons, anchored vessels as circles. Stale → 0.55 opacity. Markers tracked by `vessel.context`/waypoint id in a ref-map with add/update/remove diffing; **click handlers look up the CURRENT entity from the ref-map** — vessels are copy-on-write, so closing over the object at creation time would hand panels stale data.

**Auto-recenter:** `map.setCenter()` on every own-ship position change. v1 — free-pan and explicit "Recenter" button deferred.

**Resize handling:** `ResizeObserver` on the chart container calls `map.resize()` when CSS `display: none` toggling (split/chart-only mode switches) changes the visible size. MapLibre's built-in window resize listener doesn't catch display toggles.

**MapLibre UI overrides:** in `app.css` — `.maplibregl-ctrl-attrib` restyled to a navy strip with amber links to match the brutalist aesthetic. The default attribution-collapse button is hidden (we always show full attribution since it's tiny anyway).

## StatusBar — clock, sun, tide

The StatusBar's left section includes a glanceable time + sun + tide cluster (`src/statusbar/ClockSunTide.tsx`). Format: `2:32 PM · ☀↘ 7:47 PM · 〰↗ Castine · High 4:15 PM`.

- **Time** — 12-hour, ticks at 60-second cadence (`src/utils/clock.ts`).
- **Sun** — `suncalc` library, fully offline, takes lat/lon from `useSelf()` (falls back to mid-coast Maine when no fix yet). See `src/utils/sun.ts`.
- **Tide** — pre-fetched NOAA hi/lo predictions for Bar Harbor / Castine / Rockland, shipped as `public/tides/<year>.json` and refreshed in the background by `useTideRefresh` when the Pi sees a network. Continuous water level via cosine interpolation between bracketing events; `nearestStation(pos)` picks the reference. M2 stub remains as a last-resort fallback when both IDB and the bundle are missing — UI dims and prefixes the pill with `~` in that case. Refresh annually with `node scripts/fetch-tide-predictions.mjs`. See [docs/tides.md](docs/tides.md).

## AIS threat banding

`computeThreatBand()` in `src/utils/threat.ts` returns `'monitor' | 'caution' | 'danger'` for each AIS target. Coarse heuristic, not full CPA/TCPA — enough to surface "things to worry about" without alarm fatigue. Conservative: missing/stale data always returns `monitor` so bad data never drives warnings. Own COG is only treated as heading when SOG ≥ ~0.5 kn (below steerage way GPS COG is noise — applies to `isHeadingTowardHazard` and the narrative's relative bearings).

Thresholds:

- **danger** — within 200m (any motion), OR within 0.5 nm and closing in <3 min
- **caution** — within 1 nm closing in <8 min, OR within 2 nm closing in <15 min, OR within 500m without motion data
- **monitor** — everything else (no UI treatment, default sort by distance)

`AISList` sorts by band first (danger → caution → monitor), then by distance within each band. Caution rows get an 8px amber left bar (inset shadow); danger rows get an 8px red left bar; both get an uppercase pill at the top of the card. When CPA/TCPA proper math is added, replace the heuristic in this one function — the UI layer doesn't need to change.

## Alarm system (single-slot)

`src/alarm/alarmStore.ts` holds ONE active alarm (kinds: `anchor-drag`, `mob`, `anchorage-drying`, `hazard-proximity`); ephemeral by design (never persists across reload). Semantics every watch hook MUST follow:

- **Clear only your own kind** — `if (readActiveAlarm()?.kind === '<mine>') clearAlarm()`. A kind-blind clear wipes other watches' alarms (this bug shipped once; see `alarmInterplay.test.tsx`).
- **Episodes**: `raiseAlarm` with the same kind refreshes the message but preserves `acknowledged`/`raisedAt`. A new unacknowledged alarm only appears after the owning watch cleared it (condition went false). This is what makes Acknowledge stick while re-raising every tick.
- The AlarmBanner flash is exempt from the global reduced-motion kill (safety signal, 1 Hz — under the 2.3.1 cap).

## Data units on the wire

SignalK streams SI units: `navigation.speedOverGround` is **meters per second**; the v1 spec says angles are **radians**, but some plugins emit degrees. There is NO automatic normalization (0–6.28 is valid in both units, so conversion would be a guess): out-of-range COG is rejected by `isValidCogRad` at the consumers, which degrades bearings/threat banding to their conservative no-motion paths, and ingest logs a console warning after repeated >2π values so the misconfiguration is visible. Fix the source's units in SignalK, don't guess in the app. The store holds raw SignalK values; conversion to display units (knots, mph, statute miles, compass degrees) happens only in `src/utils/units.ts` formatters at the render layer. The `geo` client converts Geolocation's degree headings to radians at the source.

## Ingest store (`src/signalk/useSignalK.ts`)

- **Copy-on-write**: every delta produces a fresh `Vessel` object — never mutate a stored vessel (React deps/memo assume it). Granular primitive deps (`self?.position?.latitude`, …) are still preferred in hooks to avoid re-running on every delta; `react-hooks/exhaustive-deps` is ON (warn + `--max-warnings=0`), annotate intentional granular sites with a disable comment + reason.
- **Split snapshots**: `useSelf()` and `useAISTargets()` have separate listener sets — own-GPS ticks don't re-render AIS consumers and vice versa.
- **Bounded + defensive**: targets silent >30 min are evicted (sweep every 60 s); max 500 tracked targets; wire timestamps clamped to now (spoofed future timestamps can't defeat staleness); `__proto__`-style path keys skipped; names truncated to 40 chars. See `useSignalK.test.tsx`.

## Reliability

- **Error boundaries**: top-level (plain-language crash panel + loop-guarded auto-reload via `src/ui/crashReload.ts`) and a chart-local one (chart crash degrades to a "Reload chart" button while AIS + StatusBar keep working).
- **Storage**: all stores go through `defineStore`/`defineMemoryStore` (`src/storage/localStore.ts`) — versioned envelope, corruption resets to initial, optional `sanitize` (waypoints/breadcrumbs validate shape + lat/lon on load) and `persistDebounceMs` (breadcrumbs batch SD-card writes; flush on page hide).
- **Tide honesty**: `tideHeightNow()` returns `{heightFt, isEstimate}`. When only the M2 stub is available (no data, or clock outside the prediction window), grounding-relevant consumers show charted MLLW depths and say "tide unknown" — never a fabricated live depth; the drying alarm stays quiet (`tidesAuthoritative()`).

## Running

```bash
# Laptop dev (mock data; localhost only — add `-- --host` for cross-device)
npm run dev

# On the Pi (real SignalK)
VITE_SIGNALK_URL=ws://localhost:3000/signalk/v1/stream \
VITE_SIGNALK_MODE=real \
npm run dev

# Phone build (real GPS, offline PWA) — built by .github/workflows/deploy-phone.yml:
#   VITE_SIGNALK_MODE=geo VITE_CHARTS_BASE=<release-assets URL> npm run build
# Full walkthrough: docs/phone-test.md
```

## Deferred (priority order)

1. **Depth into SignalK** — high value given the centerboard + shallow-draft profile. Requires upgrading the standalone depth finder to one with NMEA 0183 output, then wiring into the Pi via a USB-serial adapter. Unlocks a depth readout in StatusBar and a configurable shallow-water alarm.
2. **Boat heading** — GPS COG is not heading (differ when drifting/anchored/against current). Needs a compass/AHRS. Matters for accurate chart orientation at slow speeds.
3. **Engine telemetry** (RPM, coolant temp, fuel) — requires NMEA 2000 bus + engine gateway. Not planned.
4. **Wind** — low priority for a power boat. Possible if cruising in exposed water and sea state prediction matters.

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
- `--text-dim` / `--text-on-card-dim` — dimmed variants for secondary labels (alpha 0.78/0.82 day; 0.88/0.95 night — tuned to hold 7:1 AAA on their surfaces; stale AIS rows override `--text-on-card-dim` to 0.88 for the darker stale sand).

**Functional / semantic**

- `--boat-icon` `#FF6B35` — safety orange. Reserved for **our own vessel** (heading glyph, own-ship marker on chart). Don't use for anything else.
- `--vessel-name` `#0F0298` — electric blue. Used **only** for AIS vessel names.
- `--alert-amber` `#E8B84D` — amber. Stale/caution indicators, qualifier lines, threat-band caution bar/pill, `GPS stale` fix indicator.
- `--alert-red` `#8B1E12` — deep red for threat-band danger FILLS on sand cards (cream text on it 7.71:1; darkened from the original #A02418 which measured 6.40:1). **Never use it as text or a border on navy** — it reads ~2:1 there; that's `--danger`'s job (e.g. the active MOB button).
- `--ownship-accent` `#CCFF00` — tennis-ball yellow-green. Used for the own-ship triangle outline, pulsing ring, and heading vector. Pairs with `--boat-icon` orange to make own-ship unmissable on any map background. Day-mode `--waypoint` shares this hex (see below); own-ship stays distinct through shape + motion, not color.
- `--waypoint` `#CCFF00` day / `#AA6655` night — chart waypoint markers (star, anchor, mooring buoy, hazard). Chose yellow-green after sage `#6B9080` was getting lost on slate-blue water. Own-ship and waypoints share the day-mode hue but not the shape: own-ship is an oriented orange triangle with pulsing halo; waypoints are static navy-stroked glyphs. Waypoint list panels use navy ink (not the accent) so sand-card icons keep AAA contrast. Night palette shifts to warm red for dark adaptation.
- `--ok` `#5BD891` / `--danger` `#FFA0A0` — universal green/red signals for system status text on navy (GPS OK / no fix). Brightened to pass AAA on the navy bg. Distinct from the brand palette; don't repurpose.

**Interactive**

- `--focus-ring` `#E8B84D` — amber, 3px outline + 2px offset via `:focus-visible`, sandwiched by navy box-shadow rings inside and outside so the indicator holds ≥3:1 on sand and water surfaces too (amber alone is 1.55:1 on sand). The box-shadow here is functional, not decorative — the no-shadows rule below still stands for surfaces.

**Pattern: navy app chrome + sand information cards.** Any readable data payload (AIS rows, instrument cards, route entries) goes on sand. Status/chrome/navigation (StatusBar, tabs, chart canvas bezel) stays on navy. Active tabs flip to sand fill to signal "you are reading this content."

**Hard rectangles everywhere.** Every surface — data cards, tabs, filter toggles, fix indicators, future buttons — uses `border-radius: 0`. No box-shadows, no transitions, no hover lifts. The look is deliberately datasheet/chart-plotter, not material/iOS. Data cards specifically use `border: 1px solid var(--bg-navy)`. Don't introduce rounded corners on new elements; they break the aesthetic.

## Accessibility — WCAG 2.2 AAA

This project targets **WCAG 2.2 Level AAA**. Apply by default — don't ship UI changes that knowingly violate it.

Key constraints AAA imposes that bite hardest in this UI:

- **Contrast 7:1** for normal text, 4.5:1 for large (≥18pt regular / 14pt bold). Verify every new text-on-surface pairing in the navy/sand palette.
- **Touch targets ≥44×44 CSS px** (AAA, stricter than AA's 24×24). Tabs, buttons, any clickable row.
- **Focus indicator ≥2px perimeter, 3:1 contrast change**, fully visible (not obscured by sticky StatusBar). Currently `--focus-ring` amber 3px outline + 2px offset + navy sandwich rings via `:focus-visible`.
- **No `user-scalable=no`** in viewport meta — kiosk pinch-zoom must work for low-vision use.
- **Plain language at lower-secondary reading level** (AAA 3.1.5) — already aligned with the "plain-language UI" principle above.
- **Motion/animation can be disabled** — respect `prefers-reduced-motion` for the heading-glyph rotation transition and any future map animations.
- **Semantic landmarks** — `<main>`, `<nav>`, `<header>` etc., not raw `<div>` chrome.

Run `/wcag` to audit before any visible release.

## Status

**Built:** three-mode SignalK client (mock/real/geo) with backoff reconnect; bounded copy-on-write ingest store with split self/targets snapshots; MapLibre chart (offline PMTiles base + NOAA overlay, tide-aware depth contours + soundings, navaid sprites with day/night sheets); own-ship/AIS/waypoint/route/destination/MOB/anchor markers (AIS + waypoint markers are 44px buttons); AISList with threat banding + plain-language narrative; StatusBar (GPS pill, clock/sun/tide cluster with station name + estimate state, MOB, waypoints, settings, theme toggle, 3-mode tabs); single-slot alarm system (anchor drag, hazard proximity, anchorage drying) with episode/acknowledge semantics + regression tests; waypoints/routes with persisted stores + sanitized loads; breadcrumbs with dwell detection + debounced persistence; weather go/no-go (NWS); day/night/auto theme; error boundaries + crash reload; offline PWA with on-device chart caching for the phone build; navy/sand brutalist palette, WCAG 2.2 AAA re-verified 2026-07 (contrast math in the audit); self-hosted fonts; 134 unit tests + Playwright e2e.

**Not yet built:** depth/heading/wind sensors, real-Pi smoke test, real-water phone smoke test. Chart files must be generated locally once — install GDAL + tippecanoe, run `./scripts/build-charts.sh maine` (+ `build-base-charts.sh`). See [docs/charts.md](docs/charts.md), [docs/pi-kiosk.md](docs/pi-kiosk.md), [docs/phone-test.md](docs/phone-test.md), [docs/tides.md](docs/tides.md).
