// Marine-style runtime layer additions + palette for the NOAA overlay.
//
// The base-map skeleton (background, water, land, coastline, built-up areas)
// is defined declaratively in offlineStyle.ts — that style is the entire
// style the map boots with, so nothing in this module depends on an
// external CDN (former OpenFreeMap positron dependency has been removed).
//
// This module still owns:
//   - Depth contour + sounding color expressions (they need CSS vars +
//     live tide updates, so they can't be static in offlineStyle.ts)
//   - addNoaaChartLayers — runtime-added NOAA symbol layers with
//     expressions, filters, and text-field expressions
//   - applyLabelPriority tri-state — modulates z-order between place
//     and depth labels at the operator's preference
//
// If the NOAA PMTiles aren't present (fresh clone before running
// build-charts.sh), the style silently degrades: sand background +
// whatever tiles exist. App still works.

import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { ChartLabelPriority } from '../types/nav';

// NOAA chart data served as a single PMTiles file from our public/ dir.
// Built by scripts/build-charts.sh — see docs/charts.md for regen instructions.
// If the file isn't present, the NOAA source will fail silently and only the
// OpenFreeMap base tiles render (no depth contours / buoys).
// To switch regions, regenerate with the desired bundle and update this URL.
const NOAA_PMTILES_URL = 'pmtiles:///charts/maine.pmtiles';

// Read a CSS custom property off :root (falls back to the provided default if
// the var is unset or we're running in a non-DOM environment like SSR/tests).
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const COLORS = {
  water: '#547A9E',
  land: '#F0EBE0',
  coastline: '#142038',
  roadMajor: '#9a9a9a',
  roadMinor: '#bfbfbf',
  labelStrong: '#142038',
  labelHalo: '#F0EBE0',
  // Depth contour colors — sourced from :root CSS vars so tokens stay in one
  // place. Defaults mirror the --depth-* tokens; fallback keeps the chart
  // styled if CSS fails to load.
  depthShallow: cssVar('--depth-shallow', '#FF3B1A'), // < 1.83m (6ft)
  depthModerate: cssVar('--depth-mid', '#FFD700'), // 1.83 – 6.10m (6–20ft)
  depthDeep: cssVar('--depth-deep', '#6FECB0'), // > 6.10m (20ft+)
  // Marine features
  buoy: '#E8B84D',
  buoyOutline: '#142038',
  wreck: '#A02418',
};

export const DEPTH_BREAK_SHALLOW_M = 1.83; // meters (6 ft) — VALDCO breakpoint
export const DEPTH_BREAK_MODERATE_M = 6.1; // meters (20 ft) — VALDCO breakpoint

const DEPTH_BREAK_SHALLOW = DEPTH_BREAK_SHALLOW_M;
const DEPTH_BREAK_MODERATE = DEPTH_BREAK_MODERATE_M;

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

// Landmark label layer from the offline base style. Treated as the "place
// name" tier for label-priority collision — lighthouses and conspicuous
// features shouldn't get buried under depth contour labels, and vice versa.
const PLACE_LABEL_LAYERS = ['landmark-lndmrk'] as const;
const DEPTH_LABEL_LAYER = 'noaa-depth-contour-label';

// ── NOAA ENC layers (depth contours, buoys, lights, wrecks, etc.) ─────

const DEPTH_COLOR_EXPRESSION: DataDrivenPropertyValueSpecification<string> =
  depthColorExpressionForTide(0);

/**
 * Depth-contour color expression shifted by the current tide height.
 * Soundings (VALDCO) are referenced to mean low water — effective depth at a
 * contour = VALDCO + tide above MLW. So "shallow" now means VALDCO + tide <
 * shallow-threshold, i.e., VALDCO < shallow-threshold − tide. We shift the
 * step breaks down by the current tide in meters. Never negative.
 */
export function depthColorExpressionForTide(
  tideFt: number,
): DataDrivenPropertyValueSpecification<string> {
  const tideM = tideFt * 0.3048;
  const shallowBreak = Math.max(0.01, DEPTH_BREAK_SHALLOW - tideM);
  const moderateBreak = Math.max(shallowBreak + 0.01, DEPTH_BREAK_MODERATE - tideM);
  return [
    'step',
    ['to-number', ['get', 'VALDCO']],
    COLORS.depthShallow,
    shallowBreak,
    COLORS.depthModerate,
    moderateBreak,
    COLORS.depthDeep,
  ] as unknown as ExpressionSpecification;
}

/**
 * Parallel color expression for spot-sounding labels. S-57 SOUNDG features
 * carry their depth in either the VALSOU or DEPTH attribute (meters to MLLW)
 * depending on how ogr2ogr was configured at PMTiles build time. Coalescing
 * both keeps the style robust across rebuild variants.
 */
export function soundingColorExpressionForTide(
  tideFt: number,
): DataDrivenPropertyValueSpecification<string> {
  const tideM = tideFt * 0.3048;
  const shallowBreak = Math.max(0.01, DEPTH_BREAK_SHALLOW - tideM);
  const moderateBreak = Math.max(shallowBreak + 0.01, DEPTH_BREAK_MODERATE - tideM);
  return [
    'step',
    ['to-number', ['coalesce', ['get', 'VALSOU'], ['get', 'DEPTH']]],
    COLORS.depthShallow,
    shallowBreak,
    COLORS.depthModerate,
    moderateBreak,
    COLORS.depthDeep,
  ] as unknown as ExpressionSpecification;
}

/**
 * Text-field expression for spot-depth labels. Adds the current tide
 * height to the charted (low-tide) value so the on-chart number is the
 * depth an operator will see under their keel RIGHT NOW — no mental math
 * at the helm. Gets recomputed on every tide-refresh tick by
 * applyTideToDepthContours.
 */
export function soundingLabelExpressionForTide(
  tideFt: number,
): DataDrivenPropertyValueSpecification<string> {
  return [
    'to-string',
    [
      'round',
      [
        '+',
        ['*', ['to-number', ['coalesce', ['get', 'VALSOU'], ['get', 'DEPTH']]], 3.28084],
        tideFt,
      ],
    ],
  ] as unknown as DataDrivenPropertyValueSpecification<string>;
}

export function applyTideToDepthContours(map: MapLibreMap, tideFt: number): void {
  const contourExpr = depthColorExpressionForTide(tideFt);
  if (map.getLayer('noaa-depth-contour')) {
    map.setPaintProperty('noaa-depth-contour', 'line-color', contourExpr);
  }
  if (map.getLayer('noaa-depth-contour-label')) {
    map.setPaintProperty('noaa-depth-contour-label', 'text-color', contourExpr);
  }
  const soundingColor = soundingColorExpressionForTide(tideFt);
  const soundingLabel = soundingLabelExpressionForTide(tideFt);
  if (map.getLayer('noaa-soundg-label')) {
    map.setPaintProperty('noaa-soundg-label', 'text-color', soundingColor);
    map.setLayoutProperty('noaa-soundg-label', 'text-field', soundingLabel);
  }
}

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

  addLayerIfMissing(map, {
    id: DEPTH_LABEL_LAYER,
    type: 'symbol',
    source: 'noaa',
    'source-layer': 'depcnt',
    minzoom: 12,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['concat', ['to-string', ['get', 'VALDCO']], ' m'],
      'text-font': ['Noto Sans Bold'],
      // Bumped from 11 → 13 with a thicker halo so numbers stay readable at
      // the helm in glare. Paired with the DepthLegend component so the
      // color meaning is self-evident even when the labels are crowded.
      'text-size': 13,
      'text-letter-spacing': 0.05,
      // Shallower contours (smaller VALDCO) are more safety-critical — let
      // MapLibre place them first, so when labels crowd, the deepest ones are
      // the first to drop.
      'symbol-sort-key': ['to-number', ['get', 'VALDCO']],
    },
    paint: {
      'text-color': DEPTH_COLOR_EXPRESSION,
      'text-halo-color': COLORS.land,
      'text-halo-width': 2.5,
    },
  });

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
  const soundingDepthM = ['coalesce', ['get', 'VALSOU'], ['get', 'DEPTH']] as unknown as ExpressionSpecification;
  addLayerIfMissing(map, {
    id: 'noaa-soundg-label',
    type: 'symbol',
    source: 'noaa',
    'source-layer': 'soundg',
    minzoom: 12,
    filter: [
      'any',
      ['has', 'VALSOU'],
      ['has', 'DEPTH'],
    ],
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
      'text-color': soundingColorExpressionForTide(0),
      'text-halo-color': COLORS.land,
      'text-halo-width': 1.5,
    },
  });
}

/**
 * Add a MapLibre `symbol` layer with an icon-image expression + optional
 * OBJNAM label. Shared across all navaid families so their styling stays
 * locked to the same rules. `iconImage` can be a literal icon name or a
 * full MapLibre expression for attribute-driven families (lateral, cardinal).
 */
function addNavaidSymbolLayer(
  map: MapLibreMap,
  opts: {
    id: string;
    sourceLayer: string;
    iconImage: string | unknown[];
    withLabel?: boolean;
    lightLabel?: boolean;
    filter?: unknown[];
  },
): void {
  const layout: Record<string, unknown> = {
    'icon-image': opts.iconImage,
    // Scale glyphs from a small 0.45× overview (zoom 8) up to 1.1× at
    // approach (zoom 16). Keeps dense harbors legible at zoom 12+ without
    // clutter at overview, and avoids any generic-circle fallback tier.
    'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 12, 0.8, 16, 1.1],
    'icon-allow-overlap': true,
    'icon-ignore-placement': false,
  };
  if (opts.withLabel) {
    layout['text-field'] = ['to-string', ['get', 'OBJNAM']];
    layout['text-font'] = ['Noto Sans Bold'];
    layout['text-size'] = 11;
    layout['text-offset'] = [0, 1.2];
    layout['text-anchor'] = 'top';
    layout['text-optional'] = true;
    layout['symbol-sort-key'] = ['case', ['has', 'OBJNAM'], 0, 1];
  }
  if (opts.lightLabel) {
    // Lights get a short characteristic label beside the icon ("Fl R 4s")
    // so a mariner can identify the light at a glance.
    layout['text-field'] = buildLightLabelExpression();
    layout['text-font'] = ['Noto Sans Bold'];
    layout['text-size'] = 10;
    layout['text-offset'] = [1.1, 0];
    layout['text-anchor'] = 'left';
    layout['text-optional'] = true;
  }

  const layer = {
    id: opts.id,
    type: 'symbol' as const,
    source: 'noaa',
    'source-layer': opts.sourceLayer,
    minzoom: 8,
    layout,
    paint: {
      'text-color': COLORS.coastline,
      'text-halo-color': COLORS.land,
      'text-halo-width': 1.5,
    },
    ...(opts.filter ? { filter: opts.filter } : {}),
  } as unknown as Parameters<typeof addLayerIfMissing>[1];
  addLayerIfMissing(map, layer);
}

function addNavaidSymbolLayers(map: MapLibreMap): void {
  // Lateral buoys — icon by CATLAM (1=port, 2=starboard).
  addNavaidSymbolLayer(map, {
    id: 'noaa-boylat-symbol',
    sourceLayer: 'boylat',
    iconImage: [
      'match',
      ['to-number', ['get', 'CATLAM']],
      1,
      'lateral-port-buoy',
      2,
      'lateral-starboard-buoy',
      'lateral-port-buoy',
    ],
    withLabel: true,
  });
  // Lateral beacons — same CATLAM switch, beacon silhouette.
  addNavaidSymbolLayer(map, {
    id: 'noaa-bcnlat-symbol',
    sourceLayer: 'bcnlat',
    iconImage: [
      'match',
      ['to-number', ['get', 'CATLAM']],
      1,
      'lateral-port-beacon',
      2,
      'lateral-starboard-beacon',
      'lateral-port-beacon',
    ],
    withLabel: true,
  });
  // Safe-water buoys + beacons.
  addNavaidSymbolLayer(map, {
    id: 'noaa-boysaw-symbol',
    sourceLayer: 'boysaw',
    iconImage: 'safe-water-buoy',
    withLabel: true,
  });
  addNavaidSymbolLayer(map, {
    id: 'noaa-bcnsaw-symbol',
    sourceLayer: 'bcnsaw',
    iconImage: 'safe-water-beacon',
    withLabel: true,
  });
  // Cardinal buoys — icon by CATCAM (1=N, 2=E, 3=S, 4=W).
  const cardinalSwitch = [
    'match',
    ['to-number', ['get', 'CATCAM']],
    1,
    'cardinal-north',
    2,
    'cardinal-east',
    3,
    'cardinal-south',
    4,
    'cardinal-west',
    'cardinal-north',
  ];
  addNavaidSymbolLayer(map, {
    id: 'noaa-boycar-symbol',
    sourceLayer: 'boycar',
    iconImage: cardinalSwitch,
    withLabel: true,
  });
  addNavaidSymbolLayer(map, {
    id: 'noaa-bcncar-symbol',
    sourceLayer: 'bcncar',
    iconImage: cardinalSwitch,
    withLabel: true,
  });
  // Isolated-danger buoys + beacons.
  addNavaidSymbolLayer(map, {
    id: 'noaa-boyisd-symbol',
    sourceLayer: 'boyisd',
    iconImage: 'isolated-danger',
    withLabel: true,
  });
  addNavaidSymbolLayer(map, {
    id: 'noaa-bcnisd-symbol',
    sourceLayer: 'bcnisd',
    iconImage: 'isolated-danger',
    withLabel: true,
  });
  // Special-purpose buoys.
  addNavaidSymbolLayer(map, {
    id: 'noaa-boyspp-symbol',
    sourceLayer: 'boyspp',
    iconImage: 'special-buoy',
    withLabel: true,
  });
  // Lights — only render the glyph + characteristic label when lit
  // (VALNMR > 0). Unlit objects carry LIGHTS records but don't need the ring.
  addNavaidSymbolLayer(map, {
    id: 'noaa-lights-symbol',
    sourceLayer: 'lights',
    iconImage: 'light',
    lightLabel: true,
    filter: ['>', ['to-number', ['coalesce', ['get', 'VALNMR'], 0]], 0],
  });
  // Wrecks + obstructions.
  addNavaidSymbolLayer(map, {
    id: 'noaa-wrecks-symbol',
    sourceLayer: 'wrecks',
    iconImage: 'wreck',
    withLabel: true,
  });
  addNavaidSymbolLayer(map, {
    id: 'noaa-obstrn-symbol',
    sourceLayer: 'obstrn',
    iconImage: 'obstruction',
    withLabel: true,
  });
}

// Build a MapLibre text-field expression that assembles a light's
// characteristic label from LITCHR (pattern), COLOUR, and SIGPER. Examples:
//   "Fl R 4s", "Oc G 6s", "Q R", "Iso W".
// Falls back to "" when LITCHR is missing so text-optional skips the label.
function buildLightLabelExpression(): unknown[] {
  const pattern = [
    'match',
    ['to-number', ['coalesce', ['get', 'LITCHR'], 0]],
    1,
    'F',
    2,
    'Fl',
    3,
    'LFl',
    4,
    'Q',
    5,
    'VQ',
    6,
    'UQ',
    7,
    'Iso',
    8,
    'Oc',
    11,
    'Gp Fl',
    12,
    'Mo',
    25,
    'Al',
    '',
  ];
  const colorLetter = [
    'match',
    // First colour code only — COLOUR comes through as a comma string.
    ['slice', ['to-string', ['coalesce', ['get', 'COLOUR'], '']], 0, 1],
    '1',
    ' W',
    '3',
    ' R',
    '4',
    ' G',
    '6',
    ' Y',
    '',
  ];
  const period = [
    'case',
    ['>', ['to-number', ['coalesce', ['get', 'SIGPER'], 0]], 0],
    ['concat', ' ', ['to-string', ['get', 'SIGPER']], 's'],
    '',
  ];
  return ['concat', pattern, colorLetter, period];
}

/**
 * Apply the operator's label-priority preference. Controls which symbols win
 * when place names and depth labels would collide. Safe to call repeatedly.
 *
 * The key move is `text-ignore-placement`: when set on a layer, *other* layers
 * treat that layer's symbols as invisible for collision purposes. We never set
 * `text-allow-overlap` (which would cause labels within a layer to stack on
 * each other — the bug the earlier revision shipped). Each layer still avoids
 * its own members. Layer z-order decides which layer wins pixel-wise when both
 * land on the same spot.
 *
 * - `balanced`: at overview zoom (< 14), depth is invisible to place's
 *   collision → every place label places. At approach zoom (≥ 14), default
 *   collision resumes and depth can drop place where they'd overlap. Place is
 *   always on top visually.
 * - `place`: depth is always invisible to place. Place always renders, depth
 *   shows where there's room beneath.
 * - `depth`: place is invisible to depth. Depth always renders on top; place
 *   shows where depth didn't claim space.
 */
export function applyLabelPriority(map: MapLibreMap, mode: ChartLabelPriority): void {
  // Reset both layers to defaults so mode switches don't leave stale state.
  for (const id of PLACE_LABEL_LAYERS) {
    setLayout(map, id, 'text-allow-overlap', false);
    setLayout(map, id, 'text-ignore-placement', false);
  }
  setLayout(map, DEPTH_LABEL_LAYER, 'text-allow-overlap', false);
  setLayout(map, DEPTH_LABEL_LAYER, 'text-ignore-placement', false);

  switch (mode) {
    case 'balanced': {
      const balancedDepthIgnore = [
        'step',
        ['zoom'],
        true,
        14,
        false,
      ] as unknown as ExpressionSpecification;
      setLayout(map, DEPTH_LABEL_LAYER, 'text-ignore-placement', balancedDepthIgnore);
      liftPlaceLabelsToTop(map);
      break;
    }
    case 'place': {
      setLayout(map, DEPTH_LABEL_LAYER, 'text-ignore-placement', true);
      liftPlaceLabelsToTop(map);
      break;
    }
    case 'depth': {
      for (const id of PLACE_LABEL_LAYERS) {
        setLayout(map, id, 'text-ignore-placement', true);
      }
      moveLayerToTop(map, DEPTH_LABEL_LAYER);
      break;
    }
  }
}

function liftPlaceLabelsToTop(map: MapLibreMap): void {
  for (const id of PLACE_LABEL_LAYERS) {
    moveLayerToTop(map, id);
  }
}

function addLayerIfMissing(map: MapLibreMap, layer: LayerSpecification): void {
  if (map.getLayer(layer.id)) return;
  try {
    map.addLayer(layer);
  } catch {
    // Source-layer missing from PMTiles (e.g. a region with no wrecks) is fine.
  }
}

// ── helpers ────────────────────────────────────────────────────────────

// setLayout stays — applyLabelPriority uses it to toggle text-ignore-placement
// on the depth-label and landmark layers. All other positron-schema helpers
// (setPaint / hideLayer / setLayerZoomRange) were removed when we dropped the
// OpenFreeMap inheritance — the base style is now declared in offlineStyle.ts.

function setLayout(map: MapLibreMap, layerId: string, property: string, value: unknown): void {
  if (!map.getLayer(layerId)) return;
  try {
    (map.setLayoutProperty as (l: string, p: string, v: unknown) => void)(
      layerId,
      property,
      value,
    );
  } catch {
    // ignore — layer schema may shift across theme/mode transitions
  }
}

function moveLayerToTop(map: MapLibreMap, layerId: string): void {
  if (!map.getLayer(layerId)) return;
  try {
    map.moveLayer(layerId);
  } catch {
    // ignore
  }
}
