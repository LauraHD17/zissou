// Amber polyline from own-ship through every route waypoint. GeoJSON
// LineString layer (geographic, scales with zoom). Same self-listening
// style.load pattern as HeadingVector so the layer survives Marine/Harbor
// swaps. A single-waypoint route renders identically to the old single-pin
// Go-To (own-ship → destination).

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { useSelf } from '../../signalk/useSignalK';
import { cssVar } from '../style/marineStyle';
import { isPlausiblePosition } from '../../utils/geometry';
import { useActiveRoute } from '../../waypoints/routeStore';
import type { Position } from '../../signalk/types';
import type { RouteWaypoint } from '../../types/nav';

const SOURCE_ID = 'goto-route';
const LAYER_ID = 'goto-route-line';

export function ensureGoToRouteLayer(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': cssVar('--alert-amber', '#E8B84D'), 'line-width': 2, 'line-dasharray': [2, 1] },
    });
  }
}

export function useGoToRoute(mapRef: RefObject<maplibregl.Map | null>) {
  const self = useSelf();
  const route = useActiveRoute();

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(buildFeature(self?.position, route?.waypoints ?? []));
    };

    update();
    map.on('style.load', update);
    return () => {
      map.off('style.load', update);
    };
    // Granular deps: self is copy-on-write per delta; buildFeature only reads
    // position lat/lon (route.waypoints is listed directly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapRef,
    self?.position?.latitude,
    self?.position?.longitude,
    route?.waypoints,
  ]);
}

export function buildFeature(
  ownPos: Position | undefined,
  waypoints: RouteWaypoint[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const empty: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: [],
  };
  if (!ownPos || !isPlausiblePosition(ownPos)) return empty;
  if (waypoints.length === 0) return empty;
  const coordinates: [number, number][] = [
    [ownPos.longitude, ownPos.latitude],
    ...waypoints.map((w) => [w.position.longitude, w.position.latitude] as [number, number]),
  ];
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    ],
  };
}
