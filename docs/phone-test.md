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
3. Upload the chart files **once** as release assets (git blocks files over
   100 MB, so the release is used as storage; the deploy workflow copies the
   files into the published site because browsers cannot fetch release
   assets directly — that host sends no CORS headers):

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

**iOS gotcha that governs the order:** Safari and the home-screen app are
SEPARATE storage containers. Permissions, saved settings, and downloaded
charts do NOT transfer between them — so install first, then do everything
inside the installed app, and only ever use the icon from then on.

1. Settings → Privacy & Security → **Location Services: ON** (often off on
   an old/reset phone — if it's off, the app can never even ask).
2. Open **https://laurahd17.github.io/zissou/** in **Safari** (a normal tab,
   not Private) → Share button → **Add to Home Screen**.
3. Launch from the **icon**. Allow location when asked ("While Using").
4. Enter vessel info (name, draft, cruising speed) in Settings — inside the
   icon app.
5. Tap **Download charts (~300 MB)** in the bottom-left pill and leave the
   screen open until it says "Charts saved". This is the offline copy.
6. **Verify offline before boat day:** turn wifi off, relaunch from the
   icon, and confirm the chart renders and the GPS pill gets a fix (stand
   near a window or outside — first fix can take 1–2 minutes).

## Boat-day checklist

- Settings → Display & Brightness → **Auto-Lock: Never**
- **Low Power Mode: off** (it throttles GPS)
- Brightness up for daylight; the in-app night theme handles dark running
- Bring a battery pack — GPS + screen + chart rendering drains an old
  battery in a few hours
- Optional: your main phone's hotspot gives it live weather; everything
  else (chart, tides, sun, GPS, alarms, waypoints, routes) works with no
  connection at all

## On-water usability protocol

The first real-water ride doubles as a guerrilla usability test (n=1 is fine —
you're the only operator). Run each task while underway or at anchor, note
pass/fail and anything that made you hesitate, and rate failures by severity
(4 = couldn't complete, 3 = major difficulty, 2 = hesitation, 1 = cosmetic).

| #   | Task (realistic scenario, not instructions)                                                                           | Success criteria                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | An alarm fires while you're steering. Silence it one-handed without looking away from the water for more than a beat. | Acknowledged first try, wet/gloved hand, < 3 s                       |
| 2   | Head for your home mooring: set it as destination from saved waypoints.                                               | Done in ≤ 5 taps, < 30 s                                             |
| 3   | In glare at midday, answer from the StatusBar almanac: what's the tide doing and when's sunset?                       | Read correctly at arm's length without shading the screen            |
| 4   | You're nosing into a shallow cove. Tap ahead of the bow and say how much water is there right now.                    | Depth story appears and the charted-vs-now distinction is understood |
| 5   | A vessel is converging. Open its details from the AIS list and read the radio hail aloud.                             | Panel opens first tap; script reads naturally on channel 16          |
| 6   | At the end of the day, share the day's log entry to yourself.                                                         | Ship's log entry matches the day; share sheet works offline-composed |
| 7   | Kill the app, put the phone in airplane mode, relaunch on the mooring.                                                | Chart, tides, track, and waypoints all present; no blank tiles       |

Findings with severity ≥ 3 get fixed before the Pi install; log outcomes in
DESIGN.md's change log so decisions trace back to observed behavior.

## What works on the phone vs the Pi

| Feature                                                             | Phone (geo mode)                            | Pi (real mode)     |
| ------------------------------------------------------------------- | ------------------------------------------- | ------------------ |
| Position / SOG / COG                                                | phone GPS                                   | u-blox USB GPS     |
| Chart + depth contours + tide-aware soundings                       | ✅                                          | ✅                 |
| Tides / sun / night theme / waypoints / routes / anchor watch / MOB | ✅                                          | ✅                 |
| AIS traffic                                                         | — (no receiver; panel stays honestly empty) | dAISy HAT          |
| Weather                                                             | only with internet                          | only with internet |

## Dev notes

- **Full live verification**: `node scripts/verify-phone-live.mjs` drives the
  deployed site end-to-end — chart download, byte-for-byte integrity against
  the server, and an offline reload — in a real disk-backed browser profile.
  Run it after every chart rebuild or deploy change before trusting the phone.

- Phone build = `VITE_SIGNALK_MODE=geo` + `VITE_CHARTS_BASE=<release URL>`
  (see `.github/workflows/deploy-phone.yml`). `geo` feeds
  `navigator.geolocation.watchPosition` into the standard SignalK delta
  shape (`src/signalk/client.ts`); heading arrives in degrees and is
  converted to radians at the source.
- Offline charts: the service worker serves MapLibre's byte-range requests
  from a fully-cached copy (`workbox` `rangeRequests`); the full files are
  downloaded once by `src/pwa/chartCache.ts` — range responses can't seed
  the cache, which is why the explicit download step exists.
