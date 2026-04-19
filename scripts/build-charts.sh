#!/usr/bin/env bash
# Build NOAA ENC vector tiles as a single PMTiles file.
#
# Usage:
#   ./scripts/build-charts.sh              # builds region "maine" by default
#   ./scripts/build-charts.sh penobscot    # builds region "penobscot"
#   ./scripts/build-charts.sh northeast    # (if you've defined a northeast cell list)
#
# Regions are defined by cell-list files at scripts/charts-config/<region>.txt.
# Add cells to a file (one cell ID per line, # for comments) to extend coverage.
# Output file: public/charts/<region>.pmtiles (gitignored).
#
# Requires: GDAL (ogr2ogr), tippecanoe, curl, unzip.
# Install on macOS: brew install gdal tippecanoe
# Install on Debian/Pi: apt install gdal-bin; tippecanoe via source or pre-built.

set -euo pipefail

REGION="${1:-maine}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CELLS_FILE="$SCRIPT_DIR/charts-config/${REGION}.txt"
WORK_DIR="$(mktemp -d -t "charts-${REGION}-XXXXXX")"
OUTPUT_DIR="$REPO_ROOT/public/charts"
OUTPUT_FILE="$OUTPUT_DIR/${REGION}.pmtiles"

# ENC layers we extract and keep. Rest are ignored (cables, restricted zones,
# admin boundaries, etc.) — easy to add later if needed.
LAYERS=(DEPCNT DEPARE COALNE BOYLAT BOYSAW LIGHTS WRECKS OBSTRN SOUNDG)

trap 'rm -rf "$WORK_DIR"' EXIT

# ── Pre-flight ────────────────────────────────────────────────────────
command -v ogr2ogr >/dev/null 2>&1 || { echo >&2 "ERROR: ogr2ogr not found. Install GDAL (brew install gdal)."; exit 1; }
command -v tippecanoe >/dev/null 2>&1 || { echo >&2 "ERROR: tippecanoe not found. Install it (brew install tippecanoe)."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo >&2 "ERROR: curl not found."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo >&2 "ERROR: unzip not found."; exit 1; }

[[ -f "$CELLS_FILE" ]] || { echo >&2 "ERROR: no cell list for region '$REGION' at $CELLS_FILE"; exit 1; }

mkdir -p "$OUTPUT_DIR"
cd "$WORK_DIR"

# ── Download ENC cells ────────────────────────────────────────────────
echo "[charts] Downloading cells for region '$REGION' → $WORK_DIR"
download_count=0
while IFS= read -r line; do
  cell="${line%%#*}"                            # strip inline comments
  cell="$(echo "$cell" | tr -d '[:space:]')"   # trim whitespace
  [[ -z "$cell" ]] && continue

  echo "  - $cell"
  if curl -sf -o "${cell}.zip" "https://distribution.charts.noaa.gov/wf/ENC/${cell}.zip"; then
    unzip -q -o "${cell}.zip"
    download_count=$((download_count + 1))
  else
    echo "    [warn] download failed; skipping"
  fi
done < "$CELLS_FILE"

if [[ "$download_count" -eq 0 ]]; then
  echo >&2 "ERROR: no cells downloaded successfully. Check NOAA availability and cell IDs in $CELLS_FILE."
  exit 1
fi

# ── Extract each layer into one aggregated GeoJSON ─────────────────────
echo "[charts] Extracting layers: ${LAYERS[*]}"
for layer in "${LAYERS[@]}"; do
  out="$WORK_DIR/${layer}.geojson"
  : > "$out"
  first=1
  for s57 in ENC_ROOT/*/*.000; do
    [[ -f "$s57" ]] || continue
    if [[ "$first" -eq 1 ]]; then
      ogr2ogr -f GeoJSON "$out" "$s57" "$layer" 2>/dev/null || continue
      first=0
    else
      ogr2ogr -append -f GeoJSON "$out" "$s57" "$layer" 2>/dev/null || true
    fi
  done
  if [[ -s "$out" ]]; then
    features="$(grep -c '"type": "Feature"' "$out" || true)"
    echo "  - $layer: ${features:-0} features"
  else
    echo "  - $layer: (empty, omitted)"
    rm -f "$out"
  fi
done

# ── Build PMTiles via tippecanoe ──────────────────────────────────────
echo "[charts] Building $OUTPUT_FILE"
tippecanoe_args=(
  -o "$OUTPUT_FILE"
  --force
  --maximum-zoom=16
  --minimum-zoom=8
  --drop-densest-as-needed
  --extend-zooms-if-still-dropping
)

for layer in "${LAYERS[@]}"; do
  geo="$WORK_DIR/${layer}.geojson"
  [[ -s "$geo" ]] || continue
  # Layer names in the PMTiles match MapLibre source-layer refs (lowercase).
  tippecanoe_args+=(-L "$(echo "$layer" | tr '[:upper:]' '[:lower:]'):$geo")
done

tippecanoe "${tippecanoe_args[@]}"

ls -lh "$OUTPUT_FILE"
echo "[charts] Done. Restart or hot-reload the dev server to pick up the new PMTiles."
