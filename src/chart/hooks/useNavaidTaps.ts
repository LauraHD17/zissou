// Tap routing for NOAA navaid symbol layers. Unlike AIS / saved-waypoint /
// route-pin markers (DOM elements via maplibregl.Marker, native click
// handlers), navaids are painted as MapLibre symbol layers backed by the
// PMTiles source. Taps therefore go through `queryRenderedFeatures` with
// an explicit pixel bounding box — which also gives us the 44×44 hit zone
// WCAG 2.5.8 requires without bloating the visible glyph.
//
// While a pick mode is armed (drop-pin / save-waypoint), tap routing is
// suppressed via a ref so the user's drop-pin intent wins cleanly.

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { NavaidFeature } from '../NavaidDetailPanel';
import type { NavaidKind, NavaidProperties } from '../../utils/navaidNarrative';

// Match map.getStyle()'s layer IDs exactly. Kept in a single const so
// marineStyle.ts and this hook can't drift.
export const NAVAID_LAYER_IDS = [
  'noaa-boylat-symbol',
  'noaa-boysaw-symbol',
  'noaa-boycar-symbol',
  'noaa-boyisd-symbol',
  'noaa-boyspp-symbol',
  'noaa-bcnlat-symbol',
  'noaa-bcnsaw-symbol',
  'noaa-bcncar-symbol',
  'noaa-bcnisd-symbol',
  'noaa-lights-symbol',
  'noaa-wrecks-symbol',
  'noaa-obstrn-symbol',
  // Spot soundings get the same tap-to-detail treatment so the plain-language
  // explainer teaches the operator what the numbers mean in context.
  'noaa-soundg-label',
] as const;

// Half of the WCAG 2.5.8 AAA 44×44 touch target. A 22px radius around the
// tap center becomes a 44×44 hit bbox — hands on a rocking deck get a much
// easier target without enlarging the visible glyph.
const HIT_RADIUS_PX = 22;

interface Options {
  /** Opens the detail panel for the tapped navaid. */
  onTap: (feature: NavaidFeature) => void;
  /** Ref to the active pick mode. When armed, the tap is ignored so drop-pin wins. */
  pickModeRef: RefObject<string>;
}

export function useNavaidTaps(
  mapRef: RefObject<maplibregl.Map | null>,
  { onTap, pickModeRef }: Options,
): void {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      if (pickModeRef.current && pickModeRef.current !== 'idle') return;
      const { x, y } = e.point;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [x - HIT_RADIUS_PX, y - HIT_RADIUS_PX],
        [x + HIT_RADIUS_PX, y + HIT_RADIUS_PX],
      ];
      // Only query layers that actually exist (the style may not have them
      // all yet during hot-reload or before the PMTiles fetch resolves).
      const liveLayers = NAVAID_LAYER_IDS.filter((id) => map.getLayer(id));
      if (liveLayers.length === 0) return;
      const features = map.queryRenderedFeatures(bbox, { layers: liveLayers });
      if (features.length === 0) return;
      const f = features[0];
      const layerSpec = f.layer as unknown as { 'source-layer'?: string };
      const sourceLayer = layerSpec['source-layer'] as NavaidKind | undefined;
      if (!sourceLayer) return;
      onTapRef.current({
        kind: sourceLayer,
        properties: (f.properties ?? {}) as NavaidProperties,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    };

    const cursorEnter = () => {
      if (pickModeRef.current && pickModeRef.current !== 'idle') return;
      map.getCanvas().style.cursor = 'pointer';
    };
    const cursorLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', handler);
    for (const id of NAVAID_LAYER_IDS) {
      map.on('mouseenter', id, cursorEnter);
      map.on('mouseleave', id, cursorLeave);
    }

    return () => {
      map.off('click', handler);
      for (const id of NAVAID_LAYER_IDS) {
        map.off('mouseenter', id, cursorEnter);
        map.off('mouseleave', id, cursorLeave);
      }
    };
  }, [mapRef, pickModeRef]);
}
