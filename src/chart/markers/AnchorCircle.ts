// Geographic anchor watch circle drawn as a polygon approximation (36
// vertices). Color shifts from amber (normal) to red (active alarm).

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { projectPosition } from '../../utils/geometry';
import { feetToMeters } from '../../utils/units';
import { useAnchorWatch } from '../../anchor/anchorStore';
import { marineToken } from '../style/styleTokens';
import { ensureGeoJsonLayers, subscribeGeoJsonSource } from './useGeoJsonLayer';

const SOURCE_ID = 'anchor-circle';
const FILL_LAYER = 'anchor-circle-fill';
const LINE_LAYER = 'anchor-circle-line';
const POINT_LAYER = 'anchor-circle-point';
const SEGMENTS = 36;

export function ensureAnchorCircleLayers(map: MapLibreMap): void {
  ensureGeoJsonLayers(map, SOURCE_ID, [
    {
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': ['coalesce', ['get', 'fillColor'], marineToken.alertAmber()],
        'fill-opacity': 0.1,
      },
    },
    {
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'line-color': ['coalesce', ['get', 'strokeColor'], marineToken.alertAmber()],
        'line-width': 2,
      },
    },
    {
      id: POINT_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': ['coalesce', ['get', 'color'], marineToken.alertAmber()],
        'circle-stroke-color': marineToken.bgNavy(),
        'circle-stroke-width': 1.5,
      },
    },
  ]);
}

export function useAnchorCircle(mapRef: RefObject<maplibregl.Map | null>) {
  const anchor = useAnchorWatch();

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return subscribeGeoJsonSource(map, SOURCE_ID, () => buildFeature(anchor));
  }, [mapRef, anchor]);
}

type AW = ReturnType<typeof useAnchorWatch>;

function buildFeature(anchor: AW): GeoJSON.FeatureCollection {
  if (!anchor) return { type: 'FeatureCollection', features: [] };

  const radiusM = feetToMeters(anchor.radiusFt);
  const dragging = !anchor.alarmAcknowledged; // reuse acknowledged as a coarse "still concerning" flag
  const color = dragging ? marineToken.alertRed() : marineToken.alertAmber();

  const ring: [number, number][] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const bearing = (i * 2 * Math.PI) / SEGMENTS;
    const p = projectPosition(anchor.drop, bearing, radiusM);
    ring.push([p.longitude, p.latitude]);
  }
  ring.push(ring[0]);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { fillColor: color, strokeColor: color },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
      {
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Point', coordinates: [anchor.drop.longitude, anchor.drop.latitude] },
      },
    ],
  };
}
