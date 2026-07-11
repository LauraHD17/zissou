// NOAA ENC navaid symbol layers — lateral/cardinal/safe-water/isolated-danger
// buoys + beacons, special-purpose buoys, lights (with a "Fl R 4s"
// characteristic label), wrecks, and obstructions. IALA Region B. Images are
// registered at runtime by useNavaidSpriteTheme so the day/night sheet swaps
// without restyling. Extracted from marineStyle.ts — this is the bulk of the
// runtime layer wiring and the self-contained light-label mini-DSL.

import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { COLORS } from './styleTokens';

/** Add a layer only if it isn't already present, swallowing the throw when a
 *  source-layer is missing from the PMTiles (e.g. a region with no wrecks).
 *  Makes the whole NOAA layer set idempotent across Marine/Harbor reloads. */
export function addLayerIfMissing(map: MapLibreMap, layer: LayerSpecification): void {
  if (map.getLayer(layer.id)) return;
  try {
    map.addLayer(layer);
  } catch {
    // Source-layer missing from PMTiles (e.g. a region with no wrecks) is fine.
  }
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

export function addNavaidSymbolLayers(map: MapLibreMap): void {
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
