// Applies the ChartLayersPrefs to MapLibre symbol layers. Each layer group
// maps to the IDs created in marineStyle.ts; when a group is toggled off we
// flip the layout `visibility` property on every matching layer. Cheap,
// GPU-friendly — no re-render, no source refetch.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useUserPrefs } from '../../prefs/userPrefsStore';
import type { ChartLayerPrefs } from '../../types/nav';
import { NOAA_LAYER_GROUPS } from '../style/layerIds';

export function useChartLayerVisibility(mapRef: RefObject<maplibregl.Map | null>): void {
  // Only subscribe to chartLayers, not the full prefs object — an unrelated
  // pref change (alarm volume, boat name, etc) shouldn't trigger a
  // setLayoutProperty sweep across a dozen layers.
  const layers = useUserPrefs().chartLayers;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const [group, ids] of Object.entries(NOAA_LAYER_GROUPS) as Array<[
        keyof ChartLayerPrefs,
        readonly string[],
      ]>) {
        const visibility = layers[group] ? 'visible' : 'none';
        for (const id of ids) {
          if (!map.getLayer(id)) continue;
          map.setLayoutProperty(id, 'visibility', visibility);
        }
      }
    };

    apply();
    // Re-apply on every style reload (Marine / Harbor mode swap recreates
    // the layers, dropping our visibility setting).
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [mapRef, layers]);
}
