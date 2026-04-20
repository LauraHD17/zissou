// Amber line from own-ship to active destination. GeoJSON LineString layer
// (geographic, scales with zoom). Same self-listening style.load pattern as
// HeadingVector so the layer survives Marine/Harbor swaps.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { useSelf } from '../../signalk/useSignalK';
import { isPlausiblePosition } from '../../utils/geometry';
import { useActiveDestination } from '../../waypoints/destinationStore';

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
      paint: { 'line-color': '#E8B84D', 'line-width': 2, 'line-dasharray': [2, 1] },
    });
  }
}

export function useGoToRoute(mapRef: RefObject<maplibregl.Map | null>) {
  const self = useSelf();
  const dest = useActiveDestination();

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(buildFeature(self?.position, dest?.position));
    };

    update();
    map.on('style.load', update);
    return () => {
      map.off('style.load', update);
    };
  }, [
    mapRef,
    self?.position?.latitude,
    self?.position?.longitude,
    dest?.position.latitude,
    dest?.position.longitude,
  ]);
}

function buildFeature(
  ownPos: { latitude: number; longitude: number } | undefined,
  destPos: { latitude: number; longitude: number } | undefined,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const empty: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: [],
  };
  if (!ownPos || !isPlausiblePosition(ownPos)) return empty;
  if (!destPos) return empty;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [ownPos.longitude, ownPos.latitude],
            [destPos.longitude, destPos.latitude],
          ],
        },
      },
    ],
  };
}
