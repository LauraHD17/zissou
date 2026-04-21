// Renders intermediate route waypoints (everything except the destination,
// which DestinationMarker still handles). Tap a via-point to open the
// RouteWaypointActionSheet — lets the operator remove any pin without
// clearing the whole route.
//
// Visual: small amber disc with a navy stroke — distinct from the
// destination pin, saved waypoints (yellow-green), and AIS markers.

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import maplibregl from 'maplibre-gl';
import type { RouteWaypoint } from '../../types/nav';
import { useActiveRoute } from '../../waypoints/routeStore';

interface Options {
  onTap: (waypoint: RouteWaypoint) => void;
}

export function useRouteViaMarkers(
  mapRef: RefObject<maplibregl.Map | null>,
  { onTap }: Options,
): void {
  const route = useActiveRoute();
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Vias = all waypoints EXCEPT the last one (which is the destination and
    // is rendered by DestinationMarker).
    const vias: RouteWaypoint[] =
      route && route.waypoints.length > 1 ? route.waypoints.slice(0, -1) : [];

    const seen = new Set<string>();
    for (const wp of vias) {
      seen.add(wp.id);
      let marker = markersRef.current.get(wp.id);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'route-via-marker';
        el.setAttribute('aria-label', 'Route waypoint. Tap to remove.');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onTapRef.current(wp);
        });
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([wp.position.longitude, wp.position.latitude])
          .addTo(map);
        markersRef.current.set(wp.id, marker);
      } else {
        marker.setLngLat([wp.position.longitude, wp.position.latitude]);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [mapRef, route?.waypoints]);

  // Cleanup on unmount.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
    };
  }, []);
}
