import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';

const NICE_NM = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
const TARGET_PX = 130;
const M_PER_NM = 1852;
const M_PER_MILE = 1609.344;

interface Scale {
  widthPx: number;
  label: string;
}

export function ScaleBar({ mapRef }: { mapRef: RefObject<maplibregl.Map | null> }) {
  const scale = useScale(mapRef);
  if (!scale) return null;
  return (
    <div className="map-scalebar" aria-label={`Map scale ${scale.label}`}>
      <div className="map-scalebar__line" style={{ width: `${scale.widthPx}px` }}>
        <span className="map-scalebar__tick map-scalebar__tick--left" aria-hidden="true" />
        <span className="map-scalebar__tick map-scalebar__tick--right" aria-hidden="true" />
      </div>
      <span className="map-scalebar__label">{scale.label}</span>
    </div>
  );
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
        prev.label === next.label
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
  return { widthPx, label: `${nmStr} nm (${miStr} mi)` };
}
