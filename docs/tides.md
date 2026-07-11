# Tide predictions (NOAA)

The app reads pre-fetched NOAA harmonic tide predictions for three Penobscot
Bay stations and interpolates between high/low events to produce a
continuous water-level curve. Everything runs offline once the JSON file is
in `public/tides/`. The Pi will also refresh in the background if it sees a
network — but that's a bonus, not a requirement.

Stations:

| ID      | Name       | Coverage                        |
| ------- | ---------- | ------------------------------- |
| 8413320 | Bar Harbor | East side, MDI / outer bay      |
| 8414672 | Castine    | Bagaduce, upper bay             |
| 8415490 | Rockland   | West side / Camden / Vinalhaven |

The app picks the station nearest to your current GPS fix automatically,
and shows the station name in the status-bar tide pill so you know which
reference is in play.

## Annual refresh (laptop)

Run once at the start of every cruising season, then commit the result.
The script writes a 2-year window (current year + next year) so you have
overlap into the off-season.

```bash
node scripts/fetch-tide-predictions.mjs               # current year + next
node scripts/fetch-tide-predictions.mjs 2027 1        # only 2027
node scripts/fetch-tide-predictions.mjs 2027 2        # 2027 + 2028
```

Output: `public/tides/<startYear>.json` (~470 KB raw, ~50 KB gzipped).
Commit the file. Rebuild and redeploy the Pi bundle.

## Background refresh on the Pi

`src/utils/useTideRefresh.ts` triggers on app boot. If the bundled JSON is
within 30 days of expiring, OR the data is older than 90 days, AND the Pi
appears to be online, the hook hits NOAA directly and writes a fresh copy
to IndexedDB. The next page load picks up the IDB copy automatically.

Triggers happen during normal phone-tether sessions — same opportunity as
weather refresh. If NOAA is unreachable, the hook silently no-ops and the
bundled copy keeps working untouched.

## Data flow

1. **IndexedDB** (`navapp` / `kv` / `tides-v1`) — refreshed copy from the Pi
   hook. Wins if its `fetchedAt` is newer than the bundled file.
2. **Bundled** `/tides/<currentYear>.json` — written by the laptop script,
   shipped in the build.
3. **M2 stub** — single-constituent fallback. Triggers when both IDB and
   bundle are absent, or when the operator's clock is outside the loaded
   window. The status-bar tide pill dims and shows a `~` prefix in this
   case so the operator knows the value isn't authoritative.

## Adding stations later

Edit the `STATIONS` array in `scripts/fetch-tide-predictions.mjs` and the
`FALLBACK_STATIONS` array in `src/utils/useTideRefresh.ts`. Confirm new
station IDs by querying the NOAA metadata API:

```bash
curl -s "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&state=ME"
```

Only stations of `type=tidepredictions` are valid for the datagetter
endpoint. Subordinate stations without published harmonic constants will
return HTTP 400.
