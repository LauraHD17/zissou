// Geographic anchor watch circle drawn as a polygon approximation (36
// vertices). Color shifts from amber (normal) to red (active alarm).

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { projectPosition } from '../../utils/geometry';
import { useAnchorWatch } from '../../anchor/anchorStore';

const SOURCE_ID = 'anchor-circle';
const FILL_LAYER = 'anchor-circle-fill';
const LINE_LAYER = 'anchor-circle-line';
const POINT_LAYER = 'anchor-circle-point';
const FT_PER_METER = 3.28084;
const SEGMENTS = 36;

export function ensureAnchorCircleLayers(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(FILL_LAYER)) {
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': ['coalesce', ['get', 'fillColor'], '#E8B84D'],
        'fill-opacity': 0.10,
      },
    });
  }
  if (!map.getLayer(LINE_LAYER)) {
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'line-color': ['coalesce', ['get', 'strokeColor'], '#E8B84D'],
        'line-width': 2,
      },
    });
  }
  if (!map.getLayer(POINT_LAYER)) {
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': ['coalesce', ['get', 'color'], '#E8B84D'],
        'circle-stroke-color': '#142038',
        'circle-stroke-width': 1.5,
      },
    });
  }
}

export function useAnchorCircle(mapRef: RefObject<maplibregl.Map | null>) {
  const anchor = useAnchorWatch();

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(buildFeature(anchor));
    };

    update();
    map.on('style.load', update);
    return () => {
      map.off('style.load', update);
    };
  }, [mapRef, anchor]);
}

type AW = ReturnType<typeof useAnchorWatch>;

function buildFeature(anchor: AW): GeoJSON.FeatureCollection {
  if (!anchor) return { type: 'FeatureCollection', features: [] };

  const radiusM = anchor.radiusFt / FT_PER_METER;
  const dragging = !anchor.alarmAcknowledged; // reuse acknowledged as a coarse "still concerning" flag
  const color = dragging ? '#A02418' : '#E8B84D';

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
