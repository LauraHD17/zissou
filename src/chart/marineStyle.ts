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

const COLORS = {
  water: '#547A9E',
  land: '#F0EBE0',
  coastline: '#142038',
  roadMajor: '#9a9a9a',
  roadMinor: '#bfbfbf',
  label: '#6a6a6a',
  labelHalo: '#F0EBE0',
};

/**
 * Apply marine palette overrides to a MapLibre map after its style has loaded.
 * Safe to call repeatedly (e.g., after a mode toggle re-sets the style).
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
