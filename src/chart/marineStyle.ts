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

import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { ChartLabelPriority } from '../types/nav';

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// NOAA chart data served as a single PMTiles file from our public/ dir.
// Built by scripts/build-charts.sh — see docs/charts.md for regen instructions.
// If the file isn't present, the NOAA source will fail silently and only the
// OpenFreeMap base tiles render (no depth contours / buoys).
// To switch regions, regenerate with the desired bundle and update this URL.
const NOAA_PMTILES_URL = 'pmtiles:///charts/maine-nh-ma.pmtiles';

const COLORS = {
  water: '#547A9E',
  land: '#F0EBE0',
  coastline: '#142038',
  roadMajor: '#9a9a9a',
  roadMinor: '#bfbfbf',
  labelStrong: '#142038',
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

export const DEPTH_BREAK_SHALLOW_M = 1.83; // meters (6 ft) — VALDCO breakpoint
export const DEPTH_BREAK_MODERATE_M = 6.1; // meters (20 ft) — VALDCO breakpoint

const DEPTH_BREAK_SHALLOW = DEPTH_BREAK_SHALLOW_M;
const DEPTH_BREAK_MODERATE = DEPTH_BREAK_MODERATE_M;

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

  // Place labels — promote. Marine-chart convention: islands and towns read as
  // authoritative, uppercase, navy on sand with a strong halo so contour lines
  // passing through the text bbox don't eat the letters. Positron ships these
  // under `label_*` (not `place_label_*` — the prior IDs here were no-ops).
  for (const id of PLACE_LABEL_LAYERS) {
    setPaint(map, id, 'text-color', COLORS.labelStrong);
    setPaint(map, id, 'text-halo-color', COLORS.labelHalo);
    setPaint(map, id, 'text-halo-width', 2);
    setLayout(map, id, 'text-transform', 'uppercase');
    setLayout(map, id, 'text-letter-spacing', 0.08);
  }

  // Noise reduction — on a marine chart, route numbers and street names are
  // pure clutter. Kill road-name labels outright and defer highway shields to
  // deep-zoom only. Road *lines* remain as subtle land-texture context.
  hideLayer(map, 'highway-name-path');
  hideLayer(map, 'highway-name-minor');
  hideLayer(map, 'highway-name-major');
  for (const id of HIGHWAY_SHIELD_LAYERS) {
    setLayerZoomRange(map, id, 14);
  }
  hideLayer(map, 'poi_label');
  hideLayer(map, 'housenumber_label');
  hideLayer(map, 'waterway_label');

  addNoaaChartLayers(map);
  // Layer z-order (place-on-top vs depth-on-top) is owned by `applyLabelPriority`
  // — it's called right after this from ChartCanvas with the operator's tri-state
  // preference.
}

const PLACE_LABEL_LAYERS = ['label_other', 'label_village', 'label_town', 'label_city'] as const;
const HIGHWAY_SHIELD_LAYERS = [
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
] as const;
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

export function applyTideToDepthContours(map: MapLibreMap, tideFt: number): void {
  const expr = depthColorExpressionForTide(tideFt);
  if (map.getLayer('noaa-depth-contour')) {
    map.setPaintProperty('noaa-depth-contour', 'line-color', expr);
  }
  if (map.getLayer('noaa-depth-contour-label')) {
    map.setPaintProperty('noaa-depth-contour-label', 'text-color', expr);
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

function setPaint(map: MapLibreMap, layerId: string, property: string, value: unknown): void {
  if (!map.getLayer(layerId)) return;
  try {
    // OpenFreeMap's positron schema can shift; tinting is best-effort, and
    // each (layer, property) pair is dynamic so we can't statically type it.
    (map.setPaintProperty as (l: string, p: string, v: unknown) => void)(layerId, property, value);
  } catch {
    // ignore
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

function setLayout(map: MapLibreMap, layerId: string, property: string, value: unknown): void {
  if (!map.getLayer(layerId)) return;
  try {
    (map.setLayoutProperty as (l: string, p: string, v: unknown) => void)(
      layerId,
      property,
      value,
    );
  } catch {
    // ignore — positron schema can shift, best-effort tinting
  }
}

function setLayerZoomRange(map: MapLibreMap, layerId: string, minzoom: number): void {
  if (!map.getLayer(layerId)) return;
  try {
    map.setLayerZoomRange(layerId, minzoom, 24);
  } catch {
    // ignore
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
