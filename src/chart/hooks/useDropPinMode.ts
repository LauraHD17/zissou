// Drop-pin mode: when armed, a tap-and-hold on the chart drops a Go-To
// destination at that point. Plain tap does nothing — prevents accidental
// placement during pan. Auto-disarms after a successful drop.
//
// WCAG 2.5.7 alternative path: a coordinate-entry dialog opened from the
// drop-pin button on long-press / keyboard (see DropPinButton).

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { setDestination } from '../../waypoints/destinationStore';

const HOLD_MS = 300;
const MOVE_TOLERANCE_PX = 6;

interface Options {
  armed: boolean;
  onDrop?: () => void; // called after a successful drop (e.g. to disarm)
}

export function useDropPinMode(
  mapRef: RefObject<maplibregl.Map | null>,
  { armed, onDrop }: Options,
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !armed) return;

    let downAt: { lng: number; lat: number; px: { x: number; y: number }; t: number } | null = null;
    let timer: number | null = null;

    const onDown = (e: maplibregl.MapMouseEvent) => {
      downAt = {
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        px: { x: e.point.x, y: e.point.y },
        t: performance.now(),
      };
      timer = window.setTimeout(() => {
        if (!downAt) return;
        // Hold completed; drop a destination here.
        setDestination({
          source: 'goto-pin',
          position: { latitude: downAt.lat, longitude: downAt.lng },
          setAt: Date.now(),
        });
        downAt = null;
        timer = null;
        onDrop?.();
      }, HOLD_MS);
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!downAt) return;
      const dx = e.point.x - downAt.px.x;
      const dy = e.point.y - downAt.px.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
        // Pan, not a hold — abort.
        if (timer != null) window.clearTimeout(timer);
        timer = null;
        downAt = null;
      }
    };

    const onUp = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
      downAt = null;
    };

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    map.on('touchstart', onDown);
    map.on('touchmove', onMove);
    map.on('touchend', onUp);

    return () => {
      if (timer != null) window.clearTimeout(timer);
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.off('touchstart', onDown);
      map.off('touchmove', onMove);
      map.off('touchend', onUp);
    };
  }, [mapRef, armed, onDrop]);
}
