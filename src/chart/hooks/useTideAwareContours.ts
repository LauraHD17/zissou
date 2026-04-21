// Repaints depth contours based on current tide height, every 5 min.
// Position feeds `tideHeightFt` but the M2 stub ignores it — when the real
// NOAA implementation lands, swap to station-specific constants indexed on
// coarse position. Effect is NOT re-keyed on 1 Hz position updates.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSelf } from '../../signalk/useSignalK';
import { useNow } from '../../utils/clock';
import { FALLBACK_POS } from '../../utils/geometry';
import { tideHeightFt } from '../../utils/tides';
import { applyTideToDepthContours } from '../style/marineStyle';

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
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [mapRef, now]);
}
