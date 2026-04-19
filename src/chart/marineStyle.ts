// Marine-style overrides applied on top of OpenFreeMap's hosted "positron" style.
//
// OpenFreeMap (https://openfreemap.org) serves OpenMapTiles vector tiles + base
// styles (positron/liberty/bright) for free, no API key. We use their positron
// style URL as the baseline so we inherit their correctly-versioned tile
// references, then override paint properties to shift the palette toward our
// brutalist marine design (slate-blue water, sand land, navy coastlines).
//
// When we eventually have NOAA raster MBTiles on the Pi, this whole module
// becomes obsolete — Marine Mode swaps to an MBTiles source and the proper
// NOAA rendering (depth contours, buoys, navaids) takes over.
//
// LIMITATION (dev only): OpenMapTiles has NO bathymetric data — no depth
// contours, no soundings, no marine navaids. Those are NOAA-only. For
// dev-time marine annotations, an OpenSeaMap raster overlay
// (https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png) can be layered on
// top and shows buoys + lights + ferries + sparse depth notes. Not added by
// default because it's coverage-incomplete; opt-in if useful in dev.

import type { Map as MapLibreMap } from 'maplibre-gl';

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// NOAA chart data served as a single PMTiles file from our public/ dir.
// Built by scripts/build-charts.sh — see docs/charts.md for regen instructions.
// If the file isn't present, the NOAA source will fail silently and only the
// OpenFreeMap base tiles render (no depth contours / buoys).
// To switch regions, regenerate with the desired bundle and update this URL.
const NOAA_PMTILES_URL = 'pmtiles:///charts/maine.pmtiles';

const COLORS = {
  water: '#547A9E',
  land: '#F0EBE0',
  coastline: '#142038',
  roadMajor: '#9a9a9a',
  roadMinor: '#bfbfbf',
  label: '#6a6a6a',
  labelHalo: '#F0EBE0',
  // Depth contour colors (per design spec — depths are meters in NOAA ENC).
  depthShallow: '#FF3B1A', // < 1.83m (6ft)
  depthModerate: '#FFD700', // 1.83 – 6.10m (6–20ft)
  depthDeep: '#6FECB0', // > 6.10m (20ft+)
  // Marine features
  buoy: '#E8B84D',
  buoyOutline: '#142038',
  wreck: '#A02418',
};

const DEPTH_BREAK_SHALLOW = 1.83; // meters (6 ft)
const DEPTH_BREAK_MODERATE = 6.1; // meters (20 ft)

/**
 * Apply marine palette overrides to a MapLibre map after its style has loaded.
 * Safe to call repeatedly (e.g., after a mode toggle re-sets the style).
 *
 * Also layers on NOAA chart data (depth contours, buoys, lights, wrecks) if
 * the PMTiles file is available. Missing PMTiles silently degrades to just
 * the tinted base — app still works, no contours until the script is run.
 */
export function applyMarineStyle(map: MapLibreMap): void {
  // Background / anything not otherwise painted → sand.
  setPaint(map, 'background', 'background-color', COLORS.land);

  // Water polygons → slate blue. OpenMapTiles' water layer covers lakes,
  // rivers, and near-coast ocean masks.
  setPaint(map, 'water', 'fill-color', COLORS.water);

  // Every fill-type layer that positron uses for land-like surfaces gets sanded.
  // We enumerate the common ones; missing layers are no-ops.
  const landLayers = [
    'landcover',
    'landcover-grass',
    'landcover-wood',
    'landcover-ice',
    'landuse',
    'landuse-residential',
    'park',
    'park_outline',
    'wetland',
    'sand',
  ];
  for (const id of landLayers) {
    setPaint(map, id, 'fill-color', COLORS.land);
  }

  // Coastline — where water meets land. Styled as a hard 1px navy stroke.
  setPaint(map, 'water_outline', 'line-color', COLORS.coastline);
  setPaint(map, 'water_outline', 'line-width', 1);

  // Roads — minimize. Hide minor, dim major.
  hideLayer(map, 'road_minor');
  hideLayer(map, 'road_path');
  hideLayer(map, 'road_service');
  hideLayer(map, 'road_service_casing');
  setPaint(map, 'road_major_casing', 'line-color', COLORS.roadMinor);
  setPaint(map, 'road_major', 'line-color', COLORS.roadMajor);
  setPaint(map, 'road_major_rail', 'line-color', COLORS.roadMajor);
  setPaint(map, 'road_trunk', 'line-color', COLORS.roadMajor);
  setPaint(map, 'road_trunk_casing', 'line-color', COLORS.roadMinor);

  // Buildings — hide in marine mode (not relevant on water).
  hideLayer(map, 'building');
  hideLayer(map, 'building-top');

  // Labels — shrink and dim. Keep place names (city/town), drop the rest.
  setPaint(map, 'place_label_city', 'text-color', COLORS.label);
  setPaint(map, 'place_label_city', 'text-halo-color', COLORS.labelHalo);
  setPaint(map, 'place_label_other', 'text-color', COLORS.label);
  setPaint(map, 'place_label_other', 'text-halo-color', COLORS.labelHalo);
  hideLayer(map, 'road_label');
  hideLayer(map, 'poi_label');
  hideLayer(map, 'housenumber_label');
  hideLayer(map, 'waterway_label');

  addNoaaChartLayers(map);
}

// ── NOAA ENC layers (depth contours, buoys, lights, wrecks, etc.) ─────

const DEPTH_COLOR_EXPRESSION = [
  'step',
  ['to-number', ['get', 'VALDCO']],
  COLORS.depthShallow,
  DEPTH_BREAK_SHALLOW,
  COLORS.depthModerate,
  DEPTH_BREAK_MODERATE,
  COLORS.depthDeep,
] as unknown;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'line-color': DEPTH_COLOR_EXPRESSION as any,
      'line-width': 1,
    },
  });

  // Depth contour labels — drawn along the line, colored to match.
  addLayerIfMissing(map, {
    id: 'noaa-depth-contour-label',
    type: 'symbol',
    source: 'noaa',
    'source-layer': 'depcnt',
    minzoom: 12,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['concat', ['to-string', ['get', 'VALDCO']], ' m'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-letter-spacing': 0.05,
    },
    paint: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'text-color': DEPTH_COLOR_EXPRESSION as any,
      'text-halo-color': COLORS.land,
      'text-halo-width': 1.5,
    },
  });

  // Buoys (lateral + special) — small amber circles with navy stroke.
  for (const src of ['boylat', 'boysaw']) {
    addLayerIfMissing(map, {
      id: `noaa-${src}`,
      type: 'circle',
      source: 'noaa',
      'source-layer': src,
      paint: {
        'circle-radius': 4,
        'circle-color': COLORS.buoy,
        'circle-stroke-color': COLORS.buoyOutline,
        'circle-stroke-width': 1,
      },
    });
  }

  // Lights — amber ring.
  addLayerIfMissing(map, {
    id: 'noaa-lights',
    type: 'circle',
    source: 'noaa',
    'source-layer': 'lights',
    paint: {
      'circle-radius': 5,
      'circle-color': 'transparent',
      'circle-stroke-color': COLORS.buoy,
      'circle-stroke-width': 2,
    },
  });

  // Wrecks + obstructions — red X-style markers. Circle fill for v1; swap to
  // proper icons if you hook up a sprite sheet later.
  for (const src of ['wrecks', 'obstrn']) {
    addLayerIfMissing(map, {
      id: `noaa-${src}`,
      type: 'circle',
      source: 'noaa',
      'source-layer': src,
      paint: {
        'circle-radius': 4,
        'circle-color': COLORS.wreck,
        'circle-stroke-color': COLORS.land,
        'circle-stroke-width': 1,
      },
    });
  }
}

function addLayerIfMissing(
  map: MapLibreMap,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any,
): void {
  if (map.getLayer(layer.id)) return;
  try {
    map.addLayer(layer);
  } catch {
    // swallow — source-layer missing from PMTiles (e.g. region without
    // wrecks) is fine; layer just won't render.
  }
}

// ── helpers ────────────────────────────────────────────────────────────

function setPaint(
  map: MapLibreMap,
  layerId: string,
  property: string,
  value: unknown,
): void {
  if (!map.getLayer(layerId)) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setPaintProperty(layerId, property as any, value as any);
  } catch {
    // swallow — positron layer schema can shift; this is best-effort tinting.
  }
}

function hideLayer(map: MapLibreMap, layerId: string): void {
  if (!map.getLayer(layerId)) return;
  try {
    map.setLayoutProperty(layerId, 'visibility', 'none');
  } catch {
    // ignore
  }
}
