// Marine ↔ Harbor mode toggle. Kept for forward compatibility — both modes
// currently render the same offline style, since the former "harbor" variant
// was the raw OpenFreeMap positron base that's no longer wired in.
//
// When we want a harbor variant with its own palette tweaks (e.g. emphasize
// BUAARE fill, dim depth contours), branch inside buildOfflineStyle on the
// active mode. For now setStyle with a rebuilt offline style is a no-op
// visually but keeps the hook wired so swapping behavior later is a one-
// file change.

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { buildOfflineStyle } from '../style/offlineStyle';

export type ChartMode = 'marine' | 'harbor';

export function useChartMode(
  mapRef: RefObject<maplibregl.Map | null>,
  styleLoadedRef: MutableRefObject<boolean>,
) {
  const [mode, setMode] = useState<ChartMode>('marine');
  const modeRef = useRef<ChartMode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styleLoadedRef.current) return;

    styleLoadedRef.current = false;
    map.setStyle(buildOfflineStyle());
    // After setStyle fires, ChartCanvas's style.load handler re-runs
    // applyMarineStyle which re-adds the NOAA symbol layers + applies
    // the current label-priority preference.
  }, [mode, mapRef, styleLoadedRef]);

  return { mode, setMode, modeRef };
}
