# Running the app standalone on an iPhone

The phone build is a **real navigation instrument** — no mock data anywhere.
Position, speed, and course come from the phone's own GPS chip (which works
with no cellular plan and no wifi); the chart is the full NOAA-derived Maine
set; tides are real NOAA predictions. The AIS panel is honestly empty — a
phone has no AIS receiver (that's the dAISy HAT on the future Pi build).

**Safety note:** a phone in a cockpit is an aid to navigation, not a
replacement for eyes, paper-chart sense, and prudence. GPS accuracy is
typically 3–5 m; depth data is charted NOAA data adjusted by predicted (not
measured) tide.

## What the phone needs

- **iPhone 6s or newer running iOS 15+.** Check Settings → General → About →
  Software Version; update if below 15. The chart engine needs WebGL2, which
  Safari added in iOS 15. A phone capped at iOS 12 (iPhone 6 and older)
  cannot run the chart.
- **About 1 GB free storage** (the chart download is ~300 MB).
- No SIM/cellular plan required. The GPS chip is independent of it.

## One-time hosting setup (from the laptop)

The app is static files; it needs an HTTPS host so iOS allows GPS access and
offline installation. GitHub Pages is free (repo must be public — the repo
contains no secrets; the security audit verified this):

1. Repo: https://github.com/LauraHD17/zissou (already wired as `origin`).
2. In the repo: **Settings → Pages → Source: "GitHub Actions"**.
3. Upload the chart files **once** as release assets (they're too big for
   Pages itself; releases allow 2 GB/file and support the byte-range reads
   the chart engine uses):

   ```bash
   gh release create charts-v1 \
     public/charts/maine.pmtiles \
     public/charts/maine-base.pmtiles \
     --title "Chart files (NOAA-derived PMTiles)"
   ```

4. Push (or run the "Deploy phone build" action manually). When it finishes,
   the app is live at **https://laurahd17.github.io/zissou/**.

Rebuilding charts later? Re-run `scripts/build-charts.sh`, then update the
assets: `gh release upload charts-v1 public/charts/*.pmtiles --clobber`.

## One-time phone setup (at home, on wifi)

1. Open **https://laurahd17.github.io/zissou/** in **Safari**.
2. Allow location access when asked ("While Using the App").
3. Tap **Download charts (~300 MB)** in the bottom-left pill and leave the
   screen open until it says "Charts saved". This is the offline copy.
4. Share button → **Add to Home Screen**. (Required — home-screen apps keep
   their offline storage; a plain Safari tab can have it evicted after 7
   days of disuse.)
5. **Verify offline before boat day:** turn wifi off, launch from the home
   screen icon, and confirm the chart renders and the GPS pill gets a fix
   (stand near a window or outside — first fix can take 1–2 minutes).

## Boat-day checklist

- Settings → Display & Brightness → **Auto-Lock: Never**
- **Low Power Mode: off** (it throttles GPS)
- Brightness up for daylight; the in-app night theme handles dark running
- Bring a battery pack — GPS + screen + chart rendering drains an old
  battery in a few hours
- Optional: your main phone's hotspot gives it live weather; everything
  else (chart, tides, sun, GPS, alarms, waypoints, routes) works with no
  connection at all

## What works on the phone vs the Pi

| Feature | Phone (geo mode) | Pi (real mode) |
| --- | --- | --- |
| Position / SOG / COG | phone GPS | u-blox USB GPS |
| Chart + depth contours + tide-aware soundings | ✅ | ✅ |
| Tides / sun / night theme / waypoints / routes / anchor watch / MOB | ✅ | ✅ |
| AIS traffic | — (no receiver; panel stays honestly empty) | dAISy HAT |
| Weather | only with internet | only with internet |

## Dev notes

- Phone build = `VITE_SIGNALK_MODE=geo` + `VITE_CHARTS_BASE=<release URL>`
  (see `.github/workflows/deploy-phone.yml`). `geo` feeds
  `navigator.geolocation.watchPosition` into the standard SignalK delta
  shape (`src/signalk/client.ts`); heading arrives in degrees and is
  converted to radians at the source.
- Offline charts: the service worker serves MapLibre's byte-range requests
  from a fully-cached copy (`workbox` `rangeRequests`); the full files are
  downloaded once by `src/pwa/chartCache.ts` — range responses can't seed
  the cache, which is why the explicit download step exists.
