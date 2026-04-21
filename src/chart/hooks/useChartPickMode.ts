// Generic chart pick-position gesture. When armed, the chart is captured
// for picking a point: pan/zoom disable, a ghost pin tracks the cursor, and
// a confirmed tap fires `onPick` with the lat/lon.
//
// Tap detection uses MapLibre's own mouse + touch events paired with a
// down/up distance + time threshold. We deliberately do NOT subscribe to
// `click`:
//   - `click` drops taps that move a handful of pixels between down and up.
//     On a rocking deck that's every other tap — they came out as "no
//     marker, have to tap twice."
//   - Subscribing to `click` AND `touchend` also double-fires on touch.
// One down/up pair per gesture, across mouse + touch, with generous slop.

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { buildIconElement } from '../../icons';
import type { Position } from '../../signalk/types';

interface Options {
  armed: boolean;
  onPick: (pos: Position) => void;
}

// Max pixel drift between down and up that still counts as a tap. A deck
// roll or a fat-finger wobble of under ~12px shouldn't swallow the commit.
const TAP_SLOP_PX = 12;
// Max press duration that still counts as a tap (long-press is a separate
// gesture and not routed here).
const TAP_MAX_MS = 700;

type MapEvent = maplibregl.MapMouseEvent | maplibregl.MapTouchEvent;

export function useChartPickMode(
  mapRef: RefObject<maplibregl.Map | null>,
  { armed, onPick }: Options,
): void {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !armed) return;

    map.dragPan.disable();
    map.doubleClickZoom.disable();
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';

    const ghostEl = document.createElement('div');
    ghostEl.className = 'destination-marker destination-marker--ghost';
    ghostEl.appendChild(buildIconElement('pin', { size: 32 }));
    const ghost = new maplibregl.Marker({ element: ghostEl, anchor: 'bottom' })
      .setLngLat(map.getCenter())
      .addTo(map);
    ghost.getElement().style.visibility = 'hidden';

    const showGhostAt = (e: MapEvent) => {
      ghost.setLngLat(e.lngLat);
      ghost.getElement().style.visibility = 'visible';
    };

    // Single down-state shared by mouse and touch. MapLibre fires mouse
    // events on desktop and touch events on touchscreens; they don't overlap
    // on the same gesture, so a shared slot is safe.
    let down: { x: number; y: number; at: number } | null = null;

    const onDown = (e: MapEvent) => {
      down = { x: e.point.x, y: e.point.y, at: performance.now() };
      showGhostAt(e);
    };

    const onUp = (e: MapEvent) => {
      const d = down;
      down = null;
      if (!d) return;
      const dist = Math.hypot(e.point.x - d.x, e.point.y - d.y);
      const held = performance.now() - d.at;
      if (dist > TAP_SLOP_PX || held > TAP_MAX_MS) return;
      onPickRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
    };

    map.on('mousemove', showGhostAt);
    map.on('touchmove', showGhostAt);
    map.on('mousedown', onDown);
    map.on('mouseup', onUp);
    map.on('touchstart', onDown);
    map.on('touchend', onUp);

    return () => {
      map.off('mousemove', showGhostAt);
      map.off('touchmove', showGhostAt);
      map.off('mousedown', onDown);
      map.off('mouseup', onUp);
      map.off('touchstart', onDown);
      map.off('touchend', onUp);
      ghost.remove();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      canvas.style.cursor = '';
    };
  }, [mapRef, armed]);
}
