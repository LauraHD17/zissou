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
- **Plain-language UI.** Primary text is narrative ("5 miles to your northeast, moving away at 13 knots (15 mph)") rather than numeric/jargon readouts. Raw numbers stay visible but secondary. Bearings are relative to own heading (bow/port/starboard/stern) when known. Distance in yards under 0.25 nm, statute miles otherwise. Speed shown as knots with MPH translation in parentheses.
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
3. **Kiosk autostart on Pi** — `chromium --kiosk` via systemd.
4. **Engine telemetry** (RPM, coolant temp, fuel) — requires NMEA 2000 bus + engine gateway. Not planned.
5. **Wind** — low priority for a power boat. Possible if cruising in exposed water and sea state prediction matters.

## Status

Scaffolded: SignalK client, mock generator, `useSignalK` hook, AISList component, AISPage.
Not yet built: ChartPage, StatusBar, Leaflet integration, real-Pi testing.
