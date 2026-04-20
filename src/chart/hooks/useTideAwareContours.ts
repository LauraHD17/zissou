// Repaint depth contours based on the current tide height. Runs a 5-minute
// refresh cycle — tide changes are slow; checking more often wastes work.
// When the PMTiles file isn't present, `noaa-depth-contour` won't exist and
// the setPaintProperty no-ops (applyTideToDepthContours already guards).

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSelf } from '../../signalk/useSignalK';
import { useNow } from '../../utils/clock';
import { tideHeightFt } from '../../utils/tides';
import { applyTideToDepthContours } from '../marineStyle';

const FALLBACK_POS = { latitude: 44.4, longitude: -68.8 };
const TIDE_REFRESH_MS = 5 * 60 * 1000;

export function useTideAwareContours(mapRef: RefObject<maplibregl.Map | null>): void {
  const self = useSelf();
  const now = useNow(TIDE_REFRESH_MS);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pos = self?.position ?? FALLBACK_POS;
    const tideFt = tideHeightFt(now, pos);

    const apply = () => applyTideToDepthContours(map, tideFt);
    apply();
    // Re-apply after style loads (mode toggle re-adds the NOAA layers).
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [mapRef, now, self?.position?.latitude, self?.position?.longitude]);
}
