// Repaints depth contours based on current tide height, every 5 min.
// Position picks the nearest NOAA reference station. When only an ESTIMATE
// is available (M2 stub, or clock outside the prediction window) the shift
// is zero — contours then show charted MLLW depths, the conservative
// baseline, instead of moving by a fabricated number. Effect is NOT re-keyed
// on 1 Hz position updates; 5-min cadence is plenty for tide.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSelf } from '../../signalk/useSignalK';
import { useNow } from '../../utils/clock';
import { FALLBACK_POS } from '../../utils/geometry';
import { tideHeightNow } from '../../utils/tides';
import { applyTideToDepthContours } from '../style/depthExpressions';

const TIDE_REFRESH_MS = 5 * 60 * 1000;

export function useTideAwareContours(mapRef: RefObject<maplibregl.Map | null>): void {
  const self = useSelf();
  const now = useNow(TIDE_REFRESH_MS);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pos = self?.position ?? FALLBACK_POS;
    const reading = tideHeightNow(now, pos);
    const tideFt = reading.isEstimate ? 0 : reading.heightFt;

    const apply = () => applyTideToDepthContours(map, tideFt);
    apply();
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
    // Deliberately keyed on the 5-min tick only — repainting contours on
    // every 1 Hz position delta would thrash the style for no visible change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, now]);
}
