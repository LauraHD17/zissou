// Generic chart pick-position gesture. When armed, the chart is captured
// for picking a point: pan/zoom gestures disable, a ghost pin tracks the
// cursor/finger, and release fires `onPick` with the lat/lon. Callers decide
// what to do with the picked point — set a destination, save a waypoint, etc.
//
// WCAG 2.5.7 alternative path: a coordinate-entry dialog opened from the
// arming button (long-press / keyboard) — see the per-feature button.

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { buildIconElement } from '../../icons';
import type { Position } from '../../signalk/types';

interface Options {
  armed: boolean;
  onPick: (pos: Position) => void;
}

export function useChartPickMode(
  mapRef: RefObject<maplibregl.Map | null>,
  { armed, onPick }: Options,
): void {
  // Route onPick through a ref so a freshly-created callback from the caller
  // doesn't re-trigger the effect and tear down listeners mid-gesture.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !armed) return;

    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = 'crosshair';

    const ghostEl = document.createElement('div');
    ghostEl.className = 'destination-marker destination-marker--ghost';
    ghostEl.appendChild(buildIconElement('pin', { size: 32 }));
    const ghost = new maplibregl.Marker({ element: ghostEl, anchor: 'bottom' })
      .setLngLat(map.getCenter())
      .addTo(map);
    ghost.getElement().style.visibility = 'hidden';

    const showGhostAt = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      ghost.setLngLat(e.lngLat);
      ghost.getElement().style.visibility = 'visible';
    };

    const commit = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      onPickRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
    };

    map.on('mousemove', showGhostAt);
    map.on('touchmove', showGhostAt);
    map.on('mousedown', showGhostAt);
    map.on('touchstart', showGhostAt);
    // `click` fires on mouse and normalized touch taps; `touchend` covers
    // drag-release on touchscreens where `click` sometimes doesn't emit.
    map.on('click', commit);
    map.on('touchend', commit);

    return () => {
      map.off('mousemove', showGhostAt);
      map.off('touchmove', showGhostAt);
      map.off('mousedown', showGhostAt);
      map.off('touchstart', showGhostAt);
      map.off('click', commit);
      map.off('touchend', commit);
      ghost.remove();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = '';
    };
  }, [mapRef, armed]);
}
