# Building NOAA chart data (PMTiles)

The Marine Mode chart overlay (depth contours, buoys, lights, wrecks) comes from NOAA Electronic Navigational Charts (ENC). We process them into a single PMTiles file that MapLibre reads directly. **No tile server required** — the `.pmtiles` file is a static asset served by Vite (dev) or nginx/Caddy (production on Pi).

The chart data is **regeneratable** — not checked into git. Run the build script whenever you want to refresh, add a region, or ship to the Pi.

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
./scripts/build-charts.sh           # builds region "maine" (default)
./scripts/build-charts.sh penobscot # builds a different region (see below)
```

The script:

1. Reads a cell list from `scripts/charts-config/<region>.txt`.
2. Downloads each NOAA ENC cell zip from `distribution.charts.noaa.gov`.
3. Extracts target layers via `ogr2ogr` — depth contours (`DEPCNT`), depth areas (`DEPARE`), coastline (`COALNE`), buoys (`BOYLAT`/`BOYSAW`), lights (`LIGHTS`), wrecks (`WRECKS`), obstructions (`OBSTRN`), soundings (`SOUNDG`).
4. Merges everything into `public/charts/<region>.pmtiles` via `tippecanoe`.

Expected time: 2–5 minutes for ~10 cells. Output file size: ~50–150 MB for Maine coast.

## Extending coverage

To add more cells (Casco Bay detail, Down East, etc.):

1. Find the cell IDs at <https://nauticalcharts.noaa.gov/charts/noaa-enc.html> — the ENC catalog has a clickable map. Cells are named `US<band><producer><number>M` where band 5 = harbor scale (preferred), band 4 = approach scale.
2. Append the cell IDs to `scripts/charts-config/maine.txt` (or create a new region file).
3. Re-run the script.

To start a new region (e.g. northeast US coast):

```bash
cp scripts/charts-config/maine.txt scripts/charts-config/northeast.txt
# edit to add NH/MA/RI/CT/NY cells
./scripts/build-charts.sh northeast
```

The app currently points at `maine.pmtiles`; to switch regions, edit `NOAA_PMTILES_URL` in `src/chart/marineStyle.ts`.

## On the Pi

After building `maine.pmtiles` on a laptop:

```bash
# from the project root on the laptop
scp public/charts/maine.pmtiles pi@<pi-host>:/path/to/app/public/charts/
```

The PMTiles file just needs to sit at whatever URL the app requests it from. On the Pi, whatever web server serves the built app (nginx, Caddy, `npm run preview`) serves the PMTiles file too. PMTiles uses HTTP range requests, which all modern servers support by default.

## Refresh cadence

NOAA releases new chart editions roughly quarterly. Re-run the build script whenever you want the latest corrections (hazard updates, new buoys, etc.). The output file overwrites the previous one — MapLibre picks up the new data on next page load.
