// Tap open water → depth story. Modeled on useNavaidTaps, but runs AFTER it
// in intent: any tap that hits a navaid/sounding symbol belongs to the navaid
// detail panel, so this handler re-runs that query and yields. Only genuinely
// "empty water" taps look for a nearby charted depth — first a spot sounding
// in a wide radius (soundings are sparse), then the nearest depth contour.
// Nothing found → the current story clears and no new UI appears (silence,
// not a guess). AIS/waypoint markers are DOM buttons whose clicks never reach
// the map, so they can't collide with this.

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { NAVAID_TAPPABLE_LAYER_IDS, NOAA_LAYER_GROUPS } from '../style/layerIds';
import { tideHeightNow } from '../../utils/tides';
import { haversineMeters } from '../../utils/geometry';
import { composeDepthStory, type DepthStory } from '../../utils/depthStory';

const NAVAID_HIT_RADIUS_PX = 22; // must match useNavaidTaps
const SOUNDING_HIT_RADIUS_PX = 60; // soundings are sparse — cast a wide net
const CONTOUR_HIT_RADIUS_PX = 22;

const SOUNDING_LAYERS = NOAA_LAYER_GROUPS.soundings;
const CONTOUR_LAYERS = NOAA_LAYER_GROUPS.contours;

export interface DepthTapResult {
  story: DepthStory;
  lat: number;
  lng: number;
}

interface Options {
  /** New story on a hit; null when tapping empty water or starting a drag. */
  onResult: (result: DepthTapResult | null) => void;
  /** Ref to the active pick mode. When armed, taps belong to drop-pin. */
  pickModeRef: RefObject<string>;
}

export function useDepthTaps(
  mapRef: RefObject<maplibregl.Map | null>,
  { onResult, pickModeRef }: Options,
): void {
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      if (pickModeRef.current && pickModeRef.current !== 'idle') return;

      // A navaid/sounding under the tap → the navaid detail panel owns it.
      if (queryBox(map, e.point, NAVAID_HIT_RADIUS_PX, NAVAID_TAPPABLE_LAYER_IDS).length > 0) {
        return;
      }

      const hit = findChartedDepth(map, e);
      if (!hit) {
        onResultRef.current(null);
        return;
      }

      // Tide at the TAP position — the question is about that spot of water,
      // and the tap always has coordinates even before a GPS fix.
      const tide = tideHeightNow(new Date(), { latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      onResultRef.current({
        story: composeDepthStory({
          chartedMeters: hit.meters,
          source: hit.source,
          tideFt: tide.heightFt,
          tideIsEstimate: tide.isEstimate,
        }),
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
      });
    };

    const clear = () => onResultRef.current(null);

    map.on('click', handler);
    map.on('dragstart', clear);
    return () => {
      map.off('click', handler);
      map.off('dragstart', clear);
    };
  }, [mapRef, pickModeRef]);
}

function findChartedDepth(
  map: maplibregl.Map,
  e: maplibregl.MapMouseEvent,
): { meters: number; source: 'sounding' | 'contour' } | null {
  // Nearest spot sounding first — a measured point beats a contour band.
  const soundings = queryBox(map, e.point, SOUNDING_HIT_RADIUS_PX, SOUNDING_LAYERS);
  const nearest = nearestFeature(soundings, e.lngLat);
  if (nearest) {
    const meters = numericProp(nearest, ['VALSOU', 'DEPTH']);
    if (meters != null) return { meters, source: 'sounding' };
  }

  const contours = queryBox(map, e.point, CONTOUR_HIT_RADIUS_PX, CONTOUR_LAYERS);
  for (const f of contours) {
    const meters = numericProp(f, ['VALDCO']);
    if (meters != null) return { meters, source: 'contour' };
  }
  return null;
}

function queryBox(
  map: maplibregl.Map,
  point: { x: number; y: number },
  radiusPx: number,
  layerIds: readonly string[],
): maplibregl.MapGeoJSONFeature[] {
  const live = layerIds.filter((id) => map.getLayer(id));
  if (live.length === 0) return [];
  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [point.x - radiusPx, point.y - radiusPx],
    [point.x + radiusPx, point.y + radiusPx],
  ];
  return map.queryRenderedFeatures(bbox, { layers: live });
}

function nearestFeature(
  features: maplibregl.MapGeoJSONFeature[],
  lngLat: maplibregl.LngLat,
): maplibregl.MapGeoJSONFeature | null {
  const tap = { latitude: lngLat.lat, longitude: lngLat.lng };
  let best: maplibregl.MapGeoJSONFeature | null = null;
  let bestM = Infinity;
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const m = haversineMeters(tap, { latitude: lat, longitude: lng });
    if (m < bestM) {
      best = f;
      bestM = m;
    }
  }
  return best;
}

function numericProp(f: maplibregl.MapGeoJSONFeature, keys: string[]): number | null {
  for (const key of keys) {
    const raw = (f.properties ?? {})[key];
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}
