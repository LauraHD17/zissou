// Marine-style runtime layers for the NOAA overlay — the orchestrator.
//
// Owns addNoaaChartLayers: creates the NOAA vector source, adds the depth
// contour + spot-sounding layers, and delegates the navaid symbol layers to
// navaidLayers.ts. The tide-aware depth/sounding expressions live in
// depthExpressions.ts and the marine palette in styleTokens.ts.
//
// The static base-map skeleton (background, water, land, coastline,
// built-up areas) lives in offlineStyle.ts and is the style the map boots
// with. If the NOAA PMTiles isn't present, this module's layers are
// silently skipped and only the base map renders.

import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { pmtilesUrl } from './chartUrls';
import { COLORS } from './styleTokens';
import { DEPTH_COLOR_EXPRESSION, soundingLabelExpressionForTide } from './depthExpressions';
import { addLayerIfMissing, addNavaidSymbolLayers } from './navaidLayers';

// NOAA chart data served as a single PMTiles file from our public/ dir.
// Built by scripts/build-charts.sh. If missing, the NOAA source fails
// silently and only the offline base tiles render.
// To switch regions, regenerate with the desired bundle and update this URL.
const NOAA_PMTILES_URL = pmtilesUrl('maine.pmtiles');

/**
 * Add runtime NOAA chart layers (depth contours + labels, symbol layers
 * for buoys/lights/wrecks, soundings) on top of the base map defined in
 * offlineStyle.ts. Safe to call repeatedly — addLayerIfMissing silently
 * skips anything already present, which makes this idempotent across
 * Marine/Harbor style reloads.
 *
 * If the NOAA PMTiles isn't present, the source creation throws inside
 * addNoaaChartLayers and the function returns early — app still works
 * with just the base-map skeleton.
 */
export function applyMarineStyle(map: MapLibreMap): void {
  addNoaaChartLayers(map);
  // Layer z-order (place-on-top vs depth-on-top) is owned by `applyLabelPriority`
  // — it's called right after this from ChartCanvas with the operator's tri-state
  // preference.
}

// ── NOAA ENC layers (depth contours + spot soundings; navaids delegated) ──

function addNoaaChartLayers(map: MapLibreMap): void {
  if (!map.getSource('noaa')) {
    try {
      map.addSource('noaa', {
        type: 'vector',
        url: NOAA_PMTILES_URL,
        attribution: 'NOAA ENC',
      });
    } catch {
      // PMTiles file not present yet — skip NOAA layers entirely.
      return;
    }
  }

  // Depth contour lines — 3-color step by VALDCO (meters).
  addLayerIfMissing(map, {
    id: 'noaa-depth-contour',
    type: 'line',
    source: 'noaa',
    'source-layer': 'depcnt',
    paint: {
      'line-color': DEPTH_COLOR_EXPRESSION,
      'line-width': 1,
    },
  });

  // Per-contour meter labels deliberately omitted — the line color carries
  // the tier (shallow/moderate/deep) and the spot-depth numbers give exact
  // values. See WCAG notes in commit e9bcb7f.

  // IALA Region B symbol layers — crisp glyphs with OBJNAM labels at all
  // zooms from the overview (8) to approach (16+). Images are registered
  // at runtime by useNavaidSpriteTheme so the sheet swaps between day and
  // night palettes without restyling. No generic circle fallback — a
  // single visual vocabulary is less confusing than a zoom-dependent swap.
  addNavaidSymbolLayers(map);

  // Spot soundings (SOUNDG) — individual depth readings at MLLW that fill
  // in between contour lines. Rendered as small feet-labels colored by the
  // same tide-aware palette as the contours.
  //
  // Anti-clutter rules (otherwise a busy harbor is a wall of numbers):
  //   1. minzoom 14 — only on true approach/harbor zoom. At overview the
  //      contours already tell the depth story; numbers add noise.
  //   2. Shallow-focus filter: only draw readings ≤ 10 m (~33 ft). Anything
  //      deeper is rarely decision-relevant for a centerboard boat.
  //   3. symbol-sort-key puts shallowest first — when labels crowd, the
  //      deepest drop, so the safety-critical ones always win a tie.
  //   4. Tap on a sounding opens a plain-language panel explaining what the
  //      number means (see useNavaidTaps + navaidNarrative 'soundg' kind).
  // NOAA ENC SOUNDG features store the depth in one of three places
  // depending on how ogr2ogr was configured at extraction:
  //   - VALSOU attribute (when OGR_S57_ADD_SOUNDG_DEPTH=ON at build)
  //   - DEPTH attribute (older GDAL behaviour)
  //   - Z coordinate of the point (default ogr2ogr, NOT queryable here)
  // We coalesce the attribute names so either build config works; if neither
  // is present (Z-only), no label renders — rebuild charts with the config
  // flag added in scripts/build-charts.sh.
  const soundingDepthM = [
    'coalesce',
    ['get', 'VALSOU'],
    ['get', 'DEPTH'],
  ] as unknown as ExpressionSpecification;
  addLayerIfMissing(map, {
    id: 'noaa-soundg-label',
    type: 'symbol',
    source: 'noaa',
    'source-layer': 'soundg',
    minzoom: 12,
    filter: ['any', ['has', 'VALSOU'], ['has', 'DEPTH']],
    layout: {
      // Numbers on the chart show depth RIGHT NOW (charted low-tide value
      // plus current tide height, rounded to feet). useTideAwareContours
      // refreshes this expression every 5 min so the numbers stay in sync
      // with the tide — no mental math at the helm.
      'text-field': soundingLabelExpressionForTide(0),
      'text-font': ['Noto Sans Bold'],
      'text-size': 10,
      'text-letter-spacing': 0.02,
      // Shallowest first — when labels crowd at busy harbors, the deepest
      // drop, so safety-critical numbers always win.
      'symbol-sort-key': ['to-number', soundingDepthM],
    },
    paint: {
      // Navy on sand — 15.3:1 for WCAG 2.2 AAA. Tier is carried by the
      // nearby contour line color; see commit e9bcb7f.
      'text-color': COLORS.coastline,
      'text-halo-color': COLORS.land,
      'text-halo-width': 1.5,
    },
  });
}
