# Building NOAA chart data (PMTiles)

The Marine Mode chart overlay (depth contours, buoys, lights, wrecks) comes from NOAA Electronic Navigational Charts (ENC). We process them into a single PMTiles file that MapLibre reads directly. **No tile server required** — the `.pmtiles` file is a static asset served by Vite (dev) or whatever web server the Pi runs.

The chart data is **regeneratable** — not checked into git. Run the build script whenever you want to refresh, switch regions, or ship to the Pi.

## One-time setup (on your laptop)

Install the two CLI tools. macOS:

```bash
brew install gdal tippecanoe
```

Debian/Pi:

```bash
sudo apt install gdal-bin
# tippecanoe: build from source or use the pre-compiled binary at
# https://github.com/felt/tippecanoe/releases
```

## Build the PMTiles file

```bash
./scripts/build-charts.sh                        # builds "maine" (default, ~40 MB download)
./scripts/build-charts.sh maine nh ma            # Maine + NH + Massachusetts contiguous coast
./scripts/build-charts.sh northeast              # USCG District 1 (~100 MB): ME/NH/MA/RI/CT/NY
./scripts/build-charts.sh all                    # entire US ENC collection (~760 MB, slow)
./scripts/build-charts.sh https://.../FOO.zip    # custom bundle URL from NOAA
```

Multi-region output filename is the keys joined with `-`, so `maine nh ma` → `public/charts/maine-nh-ma.pmtiles`. Update `NOAA_PMTILES_URL` in `src/chart/marineStyle.ts` if you change regions.

What it does:

1. Downloads the NOAA pre-bundled regional ZIP from `charts.noaa.gov/ENCs/`.
2. Unzips all cells (typically 20–100 S-57 `.000` files per region).
3. Extracts target layers via `ogr2ogr` — depth contours (`DEPCNT`), depth areas (`DEPARE`), coastline (`COALNE`), buoys (`BOYLAT`/`BOYSAW`), lights (`LIGHTS`), wrecks (`WRECKS`), obstructions (`OBSTRN`), soundings (`SOUNDG`).
4. Merges everything into `public/charts/<region>.pmtiles` via `tippecanoe`.

Expected time: 2–10 minutes depending on region size. Output file: typically 40–150 MB for Maine/Northeast.

## Switching regions in the app

The app currently points at `maine.pmtiles`. To switch:

1. Run the script with the region you want: `./scripts/build-charts.sh northeast`.
2. Edit `NOAA_PMTILES_URL` in `src/chart/marineStyle.ts` to `'pmtiles:///charts/northeast.pmtiles'`.
3. Reload.

## Finding more bundles

All pre-built bundles: <https://charts.noaa.gov/ENCs/ENCs.shtml>. Look for links ending in `_ENCs.zip`. The URL can be passed directly to the script:

```bash
./scripts/build-charts.sh https://charts.noaa.gov/ENCs/SomeBundle.zip
```

## On the Pi

After building on a laptop:

```bash
scp public/charts/maine.pmtiles pi@<pi-host>:/path/to/app/public/charts/
```

The PMTiles file just needs to sit at whatever URL the app requests it from. On the Pi, whatever web server serves the built app (nginx, Caddy, `npm run preview`) serves the PMTiles file too. PMTiles uses HTTP range requests, supported by all modern servers by default.

## Refresh cadence

NOAA releases new chart editions roughly quarterly. Re-run the build script whenever you want the latest corrections (hazard updates, new buoys, etc.). The output file overwrites the previous one — MapLibre picks up the new data on next page load.
