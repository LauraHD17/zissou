#!/usr/bin/env bash
# Build NOAA ENC vector tiles as a single PMTiles file.
#
# Uses NOAA's pre-bundled regional ZIPs — one HTTP download, all cells for the
# region included. No need to guess or maintain cell IDs.
#
# Usage:
#   ./scripts/build-charts.sh              # default region: maine
#   ./scripts/build-charts.sh maine        # Maine coast (~40 MB zip)
#   ./scripts/build-charts.sh northeast    # USCG District 1: ME/NH/MA/RI/CT/NY (~100 MB)
#   ./scripts/build-charts.sh all          # every US ENC (~760 MB, slow)
#
# Output: public/charts/<region>.pmtiles  (gitignored).
# Regen cadence: NOAA updates ~quarterly. Re-run to refresh.
#
# Requires: GDAL (ogr2ogr), tippecanoe, curl, unzip.
#   macOS:  brew install gdal tippecanoe
#   Debian: apt install gdal-bin; tippecanoe via source or pre-built binary.

set -euo pipefail

REGION="${1:-maine}"

case "$REGION" in
  maine|me)
    BUNDLE_URL="https://charts.noaa.gov/ENCs/ME_ENCs.zip"
    ;;
  northeast|ne|01cgd)
    BUNDLE_URL="https://charts.noaa.gov/ENCs/01CGD_ENCs.zip"
    ;;
  all)
    BUNDLE_URL="https://charts.noaa.gov/ENCs/All_ENCs.zip"
    ;;
  *)
    # Treat any other argument as a custom URL to a NOAA ENC bundle ZIP.
    if [[ "$REGION" =~ ^https?:// ]]; then
      BUNDLE_URL="$REGION"
      REGION="custom"
    else
      echo >&2 "ERROR: unknown region '$REGION'."
      echo >&2 "       Try: maine | northeast | all | <https://.../xxx_ENCs.zip>"
      exit 1
    fi
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d -t "charts-${REGION}-XXXXXX")"
OUTPUT_DIR="$REPO_ROOT/public/charts"
OUTPUT_FILE="$OUTPUT_DIR/${REGION}.pmtiles"

# ENC layers we extract. Skip the dozens of administrative / less-critical
# layers; easy to add later.
LAYERS=(DEPCNT DEPARE COALNE BOYLAT BOYSAW LIGHTS WRECKS OBSTRN SOUNDG)

trap 'rm -rf "$WORK_DIR"' EXIT

# ── Pre-flight ────────────────────────────────────────────────────────
command -v ogr2ogr    >/dev/null 2>&1 || { echo >&2 "ERROR: ogr2ogr not found. Install GDAL (brew install gdal)."; exit 1; }
command -v tippecanoe >/dev/null 2>&1 || { echo >&2 "ERROR: tippecanoe not found. Install it (brew install tippecanoe)."; exit 1; }
command -v curl       >/dev/null 2>&1 || { echo >&2 "ERROR: curl not found."; exit 1; }
command -v unzip      >/dev/null 2>&1 || { echo >&2 "ERROR: unzip not found."; exit 1; }

mkdir -p "$OUTPUT_DIR"
cd "$WORK_DIR"

# ── Download and extract the NOAA bundle ──────────────────────────────
echo "[charts] Downloading $BUNDLE_URL"
curl -fL --progress-bar -o bundle.zip "$BUNDLE_URL"
echo "[charts] Extracting"
unzip -q bundle.zip

cell_count=$(find . -name '*.000' | wc -l | tr -d '[:space:]')
if [[ "$cell_count" -eq 0 ]]; then
  echo >&2 "ERROR: no S-57 (.000) files found in the bundle. Inspect $WORK_DIR."
  exit 1
fi
echo "[charts] Found $cell_count ENC cells"

# ── Extract each target layer into one aggregated GeoJSON ─────────────
echo "[charts] Extracting layers: ${LAYERS[*]}"
for layer in "${LAYERS[@]}"; do
  out="$WORK_DIR/${layer}.geojson"
  : > "$out"
  first=1
  while IFS= read -r s57; do
    if [[ "$first" -eq 1 ]]; then
      if ogr2ogr -f GeoJSON "$out" "$s57" "$layer" 2>/dev/null; then
        first=0
      fi
    else
      ogr2ogr -append -f GeoJSON "$out" "$s57" "$layer" 2>/dev/null || true
    fi
  done < <(find . -name '*.000')

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
  # Tippecanoe layer names are lowercased — matches MapLibre source-layer refs.
  lower="$(echo "$layer" | tr '[:upper:]' '[:lower:]')"
  tippecanoe_args+=(-L "${lower}:${geo}")
done

tippecanoe "${tippecanoe_args[@]}"

ls -lh "$OUTPUT_FILE"
echo "[charts] Done. Reload the app to pick up the new PMTiles."
