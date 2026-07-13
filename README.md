# Sisu Nav

A simple, plain-language marine navigation app for small boats on the Maine
coast. Built for a 1978 Sisu 22 in Penobscot Bay; shared as-is for friends who
want to try it on their own boat.

Runs entirely in your phone's browser as an installable app — no account, no
tracking, nothing to buy. Your position, boat details, and waypoints stay on
your device.

**Live app: https://laurahd17.github.io/zissou/**

## Try it on your phone

You need an iPhone 6s or newer (iOS 15+) — or any modern Android phone.

1. At home **on wifi**, open the link above in **Safari** (Chrome on Android).
2. Share button → **Add to Home Screen**. Open it from the new home-screen
   icon (not the browser tab).
3. When prompted, allow **location** access and tap the **chart download**
   (~300 MB, one time — that's the NOAA chart data, cached on the phone so
   everything works offline on the water).
4. Optional: tap ⚙ Settings and enter your boat's name, draft, and safety
   margin — that's what drives the shallow-water and tide warnings.

That's it. On the water the app runs fully offline: your boat on real NOAA
charts, depth contours colored by the live tide, anchor watch, man-overboard
marking, waypoints and routes, sunset and tide times.

## What you'll see

- **Your own boat** — position comes from your phone's GPS. Nothing about
  anyone else's boat is baked in.
- **Charts cover mid-coast Maine** (roughly Rockland to Bar Harbor). Outside
  Maine you'll get your boat on a mostly blank map with wrong tide data — the
  app is home-waters-only for now.
- **Tides** from the Bar Harbor / Castine / Rockland NOAA stations, bundled
  offline.

## Optional: live vessel traffic (AIS)

Your phone can't hear AIS radio directly, but if it has **cellular data** the
app can show traffic relayed from volunteer shore stations:

1. Create a free account at [aisstream.io](https://aisstream.io) and copy your
   API key.
2. In the app: ⚙ Settings → **Internet AIS (shore relay)** → check the box,
   paste the key, Save.

**Know what this is:** shore-relayed positions can be minutes old, and
coverage has gaps — an empty list can mean "no traffic" _or_ "no shore station
hears this cove." The app is honest about this: relayed vessels are labeled,
they never trigger collision warnings, and the list always shows whether the
relay is connected. Treat it as traffic _awareness_, not collision avoidance.

## The fine print

This is a hobby project, offered with no warranty of any kind. It is an aid
to situational awareness — **not** a replacement for official charts, a
depth sounder, proper lookout, or good judgment. Chart data can be outdated,
GPS can be wrong, phones get wet and die. Navigate as if the app isn't there.

## For developers

React + TypeScript + Vite, MapLibre GL with fully offline PMTiles charts,
SignalK-shaped data layer (mock / SignalK-server / phone-GPS modes).

```bash
npm install
npm run dev        # laptop dev with synthetic AIS traffic
npm test           # unit tests
npm run test:e2e   # Playwright
```

Architecture and conventions: [CLAUDE.md](CLAUDE.md) · design system:
[DESIGN.md](DESIGN.md) · chart building: [docs/charts.md](docs/charts.md) ·
phone build: [docs/phone-test.md](docs/phone-test.md) · Pi kiosk:
[docs/pi-kiosk.md](docs/pi-kiosk.md)
