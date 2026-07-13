// Own-ship track: the recorded breadcrumb trail drawn as a dotted line.
// Wears --boat-icon orange — the track IS own-vessel history, and the dotted
// pattern keeps it distinct from the solid yellow-green heading vector and
// the dashed amber go-to route.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useBreadcrumbs, type Breadcrumb } from '../../breadcrumbs/breadcrumbStore';
import { haversineNm } from '../../utils/geometry';
import { marineToken } from '../style/styleTokens';
import { ensureGeoJsonLayers, subscribeGeoJsonSource } from './useGeoJsonLayer';

const SOURCE_ID = 'own-track';
export const TRACK_LAYER_ID = 'own-track-line';

/** A pause longer than this splits the track (no straight line from
 *  yesterday's mooring to today's launch point). */
const GAP_MS = 30 * 60 * 1000;
/** A jump longer than this between consecutive points also splits — trailer
 *  moves and GPS teleports shouldn't draw a line across the bay. */
const GAP_NM = 1;

/** Add the source + layer to a freshly-loaded style. Call from `style.load`. */
export function ensureTrackLineLayer(map: MapLibreMap): void {
  ensureGeoJsonLayers(map, SOURCE_ID, [
    {
      id: TRACK_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': marineToken.boatIcon(),
        'line-width': 2,
        'line-dasharray': [1, 2],
        'line-opacity': 0.8,
      },
    },
  ]);
}

/** Feeds the recorded breadcrumbs into the track source. Visibility is the
 *  Layers panel's job (useChartLayerVisibility on TRACK_LAYER_ID). */
export function useTrackLine(mapRef: RefObject<maplibregl.Map | null>) {
  const crumbs = useBreadcrumbs();

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return subscribeGeoJsonSource(map, SOURCE_ID, () => buildTrackFeature(crumbs));
  }, [mapRef, crumbs]);
}

/** Pure: breadcrumbs → MultiLine track, split at time/distance gaps.
 *  Runs of fewer than 2 points draw nothing. */
export function buildTrackFeature(
  crumbs: Breadcrumb[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const runs: Breadcrumb[][] = [];
  let run: Breadcrumb[] = [];

  for (const point of crumbs) {
    const prev = run[run.length - 1];
    if (
      prev &&
      (point.t - prev.t > GAP_MS ||
        haversineNm(
          { latitude: prev.lat, longitude: prev.lon },
          { latitude: point.lat, longitude: point.lon },
        ) > GAP_NM)
    ) {
      runs.push(run);
      run = [];
    }
    run.push(point);
  }
  runs.push(run);

  return {
    type: 'FeatureCollection',
    features: runs
      .filter((r) => r.length >= 2)
      .map((r) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: r.map((p) => [p.lon, p.lat]),
        },
      })),
  };
}
