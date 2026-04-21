// Applies the ChartLayersPrefs to MapLibre symbol layers. Each layer group
// maps to the IDs created in marineStyle.ts; when a group is toggled off we
// flip the layout `visibility` property on every matching layer. Cheap,
// GPU-friendly — no re-render, no source refetch.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useUserPrefs } from '../../prefs/userPrefsStore';
import type { ChartLayerPrefs } from '../../types/nav';

// Group → layer ID list. Kept in one place so marineStyle.ts layer IDs and
// the ChartLayersPanel checkboxes can't drift.
const LAYER_GROUPS: Record<keyof ChartLayerPrefs, string[]> = {
  contours: ['noaa-depth-contour', 'noaa-depth-contour-label'],
  soundings: ['noaa-soundg-label'],
  navaids: [
    'noaa-boylat-symbol',
    'noaa-boysaw-symbol',
    'noaa-boycar-symbol',
    'noaa-boyisd-symbol',
    'noaa-boyspp-symbol',
    'noaa-bcnlat-symbol',
    'noaa-bcnsaw-symbol',
    'noaa-bcncar-symbol',
    'noaa-bcnisd-symbol',
  ],
  lights: ['noaa-lights-symbol'],
  hazards: ['noaa-wrecks-symbol', 'noaa-obstrn-symbol'],
};

export function useChartLayerVisibility(mapRef: RefObject<maplibregl.Map | null>): void {
  const prefs = useUserPrefs();
  const layers = prefs.chartLayers;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const [group, ids] of Object.entries(LAYER_GROUPS) as Array<[
        keyof ChartLayerPrefs,
        string[],
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
