// Renders the LAST waypoint of the active route (the destination) as a pin.
// Intermediate waypoints are rendered separately by RouteViaMarkers.
//
// Implementation notes:
//   - Depends on primitive lat/lon values, not the waypoint object reference.
//     Object-reference deps were misbehaving during rapid route-build taps —
//     the pin would lag one waypoint behind, and sometimes disappear entirely
//     while the route line still extended to the correct endpoint.
//   - Tears down and recreates the marker on every real position change
//     rather than calling setLngLat on the existing instance. A fresh marker
//     on every change is O(1) and guarantees the DOM is in sync with state;
//     reusing the marker was leaving us with stuck pins we couldn't recover
//     from without a page reload.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { buildIconElement } from '../../icons';
import { useActiveRoute } from '../../waypoints/routeStore';
import type { RouteWaypoint } from '../../types/nav';

interface Options {
  /** Tap-to-remove handler. Receives the destination waypoint; caller decides
   *  whether to open a confirmation sheet or remove outright. */
  onTap?: (waypoint: RouteWaypoint) => void;
}

export function useDestinationMarker(
  mapRef: RefObject<maplibregl.Map | null>,
  { onTap }: Options = {},
) {
  const route = useActiveRoute();
  const dest =
    route && route.waypoints.length > 0
      ? route.waypoints[route.waypoints.length - 1]
      : null;
  const lat = dest?.position.latitude ?? null;
  const lon = dest?.position.longitude ?? null;
  const source = route?.source ?? 'drop-pin';
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Always clear the old marker first, whether we're removing or moving.
    markerRef.current?.remove();
    markerRef.current = null;

    if (lat == null || lon == null || !dest) return;

    const el = document.createElement('div');
    el.className = `destination-marker destination-marker--${source}`;
    el.style.cursor = 'pointer';
    el.appendChild(buildIconElement('pin', { size: 32 }));
    // Tap opens the route-waypoint action sheet, which offers "Remove this
    // pin." Mirrors the via-pin interaction so there's one mental model:
    // tap any route pin to remove it. Stop propagation so the tap doesn't
    // also register as a drop-pin commit when build mode is armed.
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onTapRef.current?.(dest);
    });
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lon, lat])
      .addTo(map);
  }, [mapRef, lat, lon, source, dest]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );
}
