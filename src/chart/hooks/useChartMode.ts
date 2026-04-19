// Marine ↔ Harbor mode toggle. Re-sets the MapLibre style; the style.load
// handler in ChartCanvas conditionally re-applies marine palette overrides
// based on the current mode (read via modeRef).

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { BASE_STYLE_URL } from '../marineStyle';

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
    // Skip the very first run (style still loading from initial constructor).
    if (!styleLoadedRef.current) return;

    styleLoadedRef.current = false;
    map.setStyle(BASE_STYLE_URL);
    // After setStyle fires, ChartCanvas's style.load handler re-applies marine
    // overrides (if mode is 'marine') and re-adds the heading-vector layer.
  }, [mode, mapRef, styleLoadedRef]);

  return { mode, setMode, modeRef };
}
