#!/usr/bin/env bash
# Build NOAA ENC vector tiles as a single PMTiles file.
#
# Uses NOAA's pre-bundled regional ZIPs. Pass one or more region keys and the
# script downloads each bundle, merges all cells, and builds one PMTiles file.
#
# Usage:
#   ./scripts/build-charts.sh maine                   # Maine only
#   ./scripts/build-charts.sh maine nh ma             # Maine + NH + MA contiguous coast
#   ./scripts/build-charts.sh northeast               # USCG District 1 (ME/NH/MA/RI/CT/NY)
#   ./scripts/build-charts.sh all                     # every US ENC (~760 MB zip, slow)
#   ./scripts/build-charts.sh https://.../FOO.zip     # custom bundle URL (output name: custom)
#
# Multi-region output filename is the region keys joined with '-', e.g.
# `./scripts/build-charts.sh maine nh ma` → public/charts/maine-nh-ma.pmtiles.
# Update NOAA_PMTILES_URL in src/chart/marineStyle.ts if you change regions.
#
# Requires: GDAL (ogr2ogr), tippecanoe, curl, unzip.
#   macOS:  brew install gdal tippecanoe
#   Debian: apt install gdal-bin; tippecanoe via source or pre-built binary.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  REGIONS=(maine)
else
  REGIONS=("$@")
fi

# Resolve each region key to a bundle URL.
BUNDLE_URLS=()
for key in "${REGIONS[@]}"; do
  case "$key" in
    maine|me)           BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/ME_ENCs.zip") ;;
    newhampshire|nh)    BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/NH_ENCs.zip") ;;
    massachusetts|ma)   BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/MA_ENCs.zip") ;;
    rhodeisland|ri)     BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/RI_ENCs.zip") ;;
    connecticut|ct)     BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/CT_ENCs.zip") ;;
    newyork|ny)         BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/NY_ENCs.zip") ;;
    northeast|ne|01cgd) BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/01CGD_ENCs.zip") ;;
    all)                BUNDLE_URLS+=("https://charts.noaa.gov/ENCs/All_ENCs.zip") ;;
    *)
      if [[ "$key" =~ ^https?:// ]]; then
        BUNDLE_URLS+=("$key")
      else
        echo >&2 "ERROR: unknown region '$key'."
        echo >&2 "       Try: maine | nh | ma | ri | ct | ny | northeast | all | <https://.../xxx_ENCs.zip>"
        exit 1
      fi
      ;;
  esac
done

# Output filename: keys joined with '-' (URLs replaced with "custom").
out_name_parts=()
for key in "${REGIONS[@]}"; do
  if [[ "$key" =~ ^https?:// ]]; then
    out_name_parts+=("custom")
  else
    out_name_parts+=("$key")
  fi
done
OUTPUT_REGION="$(IFS='-'; echo "${out_name_parts[*]}")"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d -t "charts-${OUTPUT_REGION}-XXXXXX")"
OUTPUT_DIR="$REPO_ROOT/public/charts"
OUTPUT_FILE="$OUTPUT_DIR/${OUTPUT_REGION}.pmtiles"

# ENC layers we extract. Skip dozens of less-critical administrative layers.
LAYERS=(DEPCNT DEPARE COALNE BOYLAT BOYSAW LIGHTS WRECKS OBSTRN SOUNDG)

trap 'rm -rf "$WORK_DIR"' EXIT

# ── Pre-flight ────────────────────────────────────────────────────────
command -v ogr2ogr    >/dev/null 2>&1 || { echo >&2 "ERROR: ogr2ogr not found. Install GDAL (brew install gdal)."; exit 1; }
command -v tippecanoe >/dev/null 2>&1 || { echo >&2 "ERROR: tippecanoe not found. Install it (brew install tippecanoe)."; exit 1; }
command -v curl       >/dev/null 2>&1 || { echo >&2 "ERROR: curl not found."; exit 1; }
command -v unzip      >/dev/null 2>&1 || { echo >&2 "ERROR: unzip not found."; exit 1; }

mkdir -p "$OUTPUT_DIR"
cd "$WORK_DIR"

# ── Download and extract each NOAA bundle ─────────────────────────────
for i in "${!BUNDLE_URLS[@]}"; do
  url="${BUNDLE_URLS[$i]}"
  zip="bundle-$i.zip"
  echo "[charts] ($((i+1))/${#BUNDLE_URLS[@]}) Downloading $url"
  curl -fL --progress-bar -o "$zip" "$url"
  echo "[charts] Extracting"
  if ! unzip -oqq "$zip"; then
    echo >&2 "ERROR: extraction failed. Often disk-space exhaustion in $(dirname "$WORK_DIR")."
    echo >&2 "       Check with: df -h '$(dirname "$WORK_DIR")'"
    exit 1
  fi
  rm -f "$zip"  # free space before the next region downloads
done

cell_count=$(find . -name '*.000' | wc -l | tr -d '[:space:]')
if [[ "$cell_count" -eq 0 ]]; then
  echo >&2 "ERROR: no S-57 (.000) files found across the downloaded bundles."
  exit 1
fi
echo "[charts] Found $cell_count ENC cells across ${#BUNDLE_URLS[@]} bundle(s)"

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
  lower="$(echo "$layer" | tr '[:upper:]' '[:lower:]')"
  tippecanoe_args+=(-L "${lower}:${geo}")
done

tippecanoe "${tippecanoe_args[@]}"

ls -lh "$OUTPUT_FILE"
echo "[charts] Done. Reload the app to pick up the new PMTiles."
