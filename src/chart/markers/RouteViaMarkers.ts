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
import {
  reconcileMarkerCollection,
  useMarkerCollectionCleanup,
  type MarkerCollectionEntry,
} from './markerCollection';

interface Options {
  onTap: (waypoint: RouteWaypoint) => void;
}

export function useRouteViaMarkers(
  mapRef: RefObject<maplibregl.Map | null>,
  { onTap }: Options,
): void {
  const route = useActiveRoute();
  const markersRef = useRef<Map<string, MarkerCollectionEntry>>(new Map());
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Vias = all waypoints EXCEPT the last one (which is the destination and
    // is rendered by DestinationMarker).
    const vias: RouteWaypoint[] =
      route && route.waypoints.length > 1 ? route.waypoints.slice(0, -1) : [];

    reconcileMarkerCollection({
      map,
      markers: markersRef.current,
      items: vias,
      keyOf: (wp) => wp.id,
      lngLatOf: (wp) => [wp.position.longitude, wp.position.latitude],
      create: (wp) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'route-via-marker';
        el.setAttribute('aria-label', 'Route waypoint. Tap to remove.');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onTapRef.current(wp);
        });
        return { marker: new maplibregl.Marker({ element: el, anchor: 'center' }) };
      },
    });
    // Granular deps: the body only reads route.waypoints, and routeStore is
    // copy-on-write — the array identity changes on any route edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, route?.waypoints]);

  useMarkerCollectionCleanup(markersRef);
}
