#!/usr/bin/env bash
# Build the minimal offline BASE map from NOAA ENC land polygons.
#
# This is the counterpart to build-charts.sh. While that script extracts
# NAVAID overlay data (depth, buoys, lights, wrecks, soundings), this one
# extracts just enough geographic polygons to draw land vs water when the
# boat has no internet connection — no OpenFreeMap, no fonts.googleapis.
#
# Output: public/charts/{region}-base.pmtiles
# Extracts: LNDARE (land), BUAARE (built-up areas / towns), SLCONS
#           (piers / breakwaters / shoreline structures), LNDMRK (landmarks)
#
# Usage:
#   ./scripts/build-base-charts.sh maine
#   ./scripts/build-base-charts.sh maine nh ma
#
# Requires: GDAL (ogr2ogr), tippecanoe, curl, unzip — same as build-charts.sh.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  REGIONS=(maine)
else
  REGIONS=("$@")
fi

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
        exit 1
      fi
      ;;
  esac
done

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
WORK_DIR="$(mktemp -d -t "charts-base-${OUTPUT_REGION}-XXXXXX")"
OUTPUT_DIR="$REPO_ROOT/public/charts"
OUTPUT_FILE="$OUTPUT_DIR/${OUTPUT_REGION}-base.pmtiles"

# Base-map layers only. Small count, polygon-heavy.
LAYERS=(LNDARE BUAARE SLCONS LNDMRK)

trap 'rm -rf "$WORK_DIR"' EXIT

command -v ogr2ogr    >/dev/null 2>&1 || { echo >&2 "ERROR: ogr2ogr not found."; exit 1; }
command -v tippecanoe >/dev/null 2>&1 || { echo >&2 "ERROR: tippecanoe not found."; exit 1; }
command -v curl       >/dev/null 2>&1 || { echo >&2 "ERROR: curl not found."; exit 1; }
command -v unzip      >/dev/null 2>&1 || { echo >&2 "ERROR: unzip not found."; exit 1; }

mkdir -p "$OUTPUT_DIR"
cd "$WORK_DIR"

for i in "${!BUNDLE_URLS[@]}"; do
  url="${BUNDLE_URLS[$i]}"
  zip="bundle-$i.zip"
  echo "[base] ($((i+1))/${#BUNDLE_URLS[@]}) Downloading $url"
  curl -L --fail -o "$zip" "$url"
  echo "[base] Unzipping $zip"
  unzip -q "$zip" -d .
done

cell_count="$(find . -name '*.000' | wc -l | tr -d ' ')"
if [[ "$cell_count" -eq 0 ]]; then
  echo >&2 "ERROR: no S-57 (.000) files found."
  exit 1
fi
echo "[base] Found $cell_count ENC cells"

echo "[base] Extracting layers: ${LAYERS[*]}"
for layer in "${LAYERS[@]}"; do
  out="$WORK_DIR/${layer}.geojson"
  rm -f "$out"
  first=1
  while IFS= read -r s57; do
    if [[ "$first" -eq 1 ]]; then
      if ogr2ogr -f GeoJSON "$out" "$s57" "$layer" 2>/dev/null; then
        first=0
      fi
    else
      ogr2ogr -update -append -f GeoJSON "$out" "$s57" "$layer" 2>/dev/null || true
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

# Label CENTROID points for named land areas and towns — one point per
# feature, placed inside the polygon (ST_PointOnSurface). Labeling the
# polygons directly repeats the name once per tile-split piece ("North
# Haven Island" printed all over the island); points fix it at the source.
# Dedupe: the same island appears in multiple overlapping ENC cells, so
# group by name + ~1km-rounded centroid, keeping the largest polygon's
# point and the widest SCAMIN.
echo "[base] Generating label points"
for layer in LNDARE BUAARE; do
  src="$WORK_DIR/${layer}.geojson"
  [[ -s "$src" ]] || continue
  out="$WORK_DIR/${layer}_LABEL.geojson"
  ogr2ogr -f GeoJSON "$out" "$src" -dialect sqlite -sql "
    SELECT ST_PointOnSurface(geometry) AS geometry,
           OBJNAM,
           MAX(SCAMIN) AS SCAMIN
    FROM \"${layer}\"
    WHERE OBJNAM IS NOT NULL AND OBJNAM != ''
    GROUP BY OBJNAM,
             ROUND(ST_X(ST_Centroid(geometry)), 2),
             ROUND(ST_Y(ST_Centroid(geometry)), 2)
  " 2>/dev/null || true
  if [[ -s "$out" ]]; then
    features="$(grep -c '"type": "Feature"' "$out" || true)"
    echo "  - ${layer}_LABEL: ${features:-0} label points"
  fi
done

echo "[base] Building $OUTPUT_FILE"
tippecanoe_args=(
  -o "$OUTPUT_FILE"
  --force
  --maximum-zoom=14
  --minimum-zoom=4
  --simplification=4
  --coalesce-densest-as-needed
  -r1
)

for layer in LNDARE BUAARE; do
  geo="$WORK_DIR/${layer}_LABEL.geojson"
  [[ -s "$geo" ]] || continue
  lower="$(echo "$layer" | tr '[:upper:]' '[:lower:]')_label"
  tippecanoe_args+=(-L "${lower}:${geo}")
done

for layer in "${LAYERS[@]}"; do
  geo="$WORK_DIR/${layer}.geojson"
  [[ -s "$geo" ]] || continue
  lower="$(echo "$layer" | tr '[:upper:]' '[:lower:]')"
  tippecanoe_args+=(-L "${lower}:${geo}")
done

tippecanoe "${tippecanoe_args[@]}"

echo "[base] Done. Output: $OUTPUT_FILE"
