import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { isValidCogRad, isValidSogMs } from '../../signalk/types';
import type { Vessel } from '../../signalk/types';
import { isPlausiblePosition, projectPosition } from '../../utils/geometry';
import { marineToken } from '../style/styleTokens';
import { ensureGeoJsonLayers, subscribeGeoJsonSource } from './useGeoJsonLayer';

const SOURCE_ID = 'heading-vector';
const LAYER_ID = 'heading-vector-line';

/** Add the source + layer to a freshly-loaded style. Call from `style.load`. */
export function ensureHeadingVectorLayer(map: MapLibreMap): void {
  ensureGeoJsonLayers(map, SOURCE_ID, [
    {
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': marineToken.ownshipAccent(), 'line-width': 2 },
    },
  ]);
}

/**
 * Updates the heading-vector source whenever own-ship motion changes. Also
 * re-pushes data after each `style.load` (style swap clears layer state, so
 * the source comes back empty until the next motion delta — this catches it).
 */
export function useHeadingVector(
  mapRef: RefObject<maplibregl.Map | null>,
  self: Vessel | undefined,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return subscribeGeoJsonSource(map, SOURCE_ID, () => buildFeature(self));
    // Granular deps: self is copy-on-write per delta; buildFeature only reads
    // position lat/lon, cog, and sog — all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, self?.position?.latitude, self?.position?.longitude, self?.cog, self?.sog]);
}

function buildFeature(self: Vessel | undefined): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const empty: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: [],
  };

  if (!self?.position || !isPlausiblePosition(self.position)) return empty;
  if (!isValidCogRad(self.cog) || !isValidSogMs(self.sog)) return empty;
  if (self.sog < 0.25) return empty; // skip when stopped

  const distanceM = self.sog * 60; // 1 minute of travel
  const end = projectPosition(self.position, self.cog, distanceM);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [self.position.longitude, self.position.latitude],
            [end.longitude, end.latitude],
          ],
        },
      },
    ],
  };
}
