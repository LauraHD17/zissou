import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';

import { MILE_TO_METERS, NM_TO_METERS } from '../../utils/units';

const NICE_NM = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
const TARGET_PX = 130;
const M_PER_NM = NM_TO_METERS;
const M_PER_MILE = MILE_TO_METERS;

interface Scale {
  widthPx: number;
  label: string;
  zoomLabel: string;
}

export function ScaleBar({ mapRef }: { mapRef: RefObject<maplibregl.Map | null> }) {
  const scale = useScale(mapRef);
  if (!scale) return null;
  return (
    <div className="map-scalebar" aria-label={`Map scale ${scale.label}, ${scale.zoomLabel} view`}>
      <span className="map-scalebar__zoom">{scale.zoomLabel}</span>
      <div className="map-scalebar__line" style={{ width: `${scale.widthPx}px` }}>
        <span className="map-scalebar__tick map-scalebar__tick--left" aria-hidden="true" />
        <span className="map-scalebar__tick map-scalebar__tick--right" aria-hidden="true" />
      </div>
      <span className="map-scalebar__label">{scale.label}</span>
    </div>
  );
}

/**
 * Plain-language name for the current chart zoom. Mariners think in
 * "approach / harbor / close-up" bands, not numeric zoom levels.
 * Also a hint for which chart details activate where: spot depths turn on
 * at "approach" (z12), which this label now communicates implicitly.
 */
function zoomLabelFor(zoom: number): string {
  if (zoom < 9) return 'coast';
  if (zoom < 11) return 'bay';
  if (zoom < 13) return 'approach';
  if (zoom < 15) return 'harbor';
  return 'close-up';
}

function useScale(mapRef: RefObject<maplibregl.Map | null>): Scale | null {
  const [scale, setScale] = useState<Scale | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Pan fires move events constantly; only re-render the bar when the rounded
    // pixel width or label actually changes.
    const update = () => {
      const next = computeScale(map);
      setScale((prev) =>
        prev != null &&
        Math.round(prev.widthPx) === Math.round(next.widthPx) &&
        prev.label === next.label &&
        prev.zoomLabel === next.zoomLabel
          ? prev
          : next,
      );
    };
    update();
    map.on('move', update);
    map.on('zoom', update);
    map.on('load', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
      map.off('load', update);
    };
  }, [mapRef]);

  return scale;
}

function computeScale(map: maplibregl.Map): Scale {
  const lat = map.getCenter().lat;
  const zoom = map.getZoom();
  // Web Mercator m/px at zoom z, latitude φ.
  const metersPerPixel = (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

  const targetMeters = TARGET_PX * metersPerPixel;
  const targetNm = targetMeters / M_PER_NM;

  let chosenNm = NICE_NM[NICE_NM.length - 1];
  let bestDelta = Infinity;
  for (const nm of NICE_NM) {
    const delta = Math.abs(nm - targetNm);
    if (delta < bestDelta) {
      bestDelta = delta;
      chosenNm = nm;
    }
  }

  const widthPx = (chosenNm * M_PER_NM) / metersPerPixel;
  const mi = (chosenNm * M_PER_NM) / M_PER_MILE;
  const nmStr = chosenNm < 1 ? chosenNm.toFixed(2).replace(/0$/, '') : String(chosenNm);
  const miStr =
    mi < 1 ? mi.toFixed(2).replace(/0$/, '') : mi < 10 ? mi.toFixed(1) : String(Math.round(mi));
  return {
    widthPx,
    label: `${nmStr} nm (${miStr} mi)`,
    zoomLabel: zoomLabelFor(zoom),
  };
}
