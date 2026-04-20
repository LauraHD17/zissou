// Saved waypoints rendered as DOM markers on the chart. All sage; icon
// shape differentiates category. Faded out below zoom 11 to reduce clutter
// at low zoom (active Go-To destination always visible — separate marker).

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { buildIconElement, type IconName } from '../../icons';
import { useWaypoints } from '../../waypoints/waypointStore';
import type { SavedWaypoint, WaypointCategory } from '../../types/nav';

const CATEGORY_ICON: Record<WaypointCategory, IconName> = {
  mooring: 'mooringBuoy',
  anchorage: 'anchor',
  hazard: 'warning',
  poi: 'star',
};

const VISIBLE_FROM_ZOOM = 11;

interface MarkerEntry {
  marker: maplibregl.Marker;
  appliedCategory: WaypointCategory;
}

interface Options {
  onTap: (waypoint: SavedWaypoint) => void;
}

export function useWaypointMarkers(mapRef: RefObject<maplibregl.Map | null>, { onTap }: Options) {
  const waypoints = useWaypoints();
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // Sync markers with the current waypoints list (add / update / remove).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const wp of waypoints) {
      seen.add(wp.id);
      let entry = markersRef.current.get(wp.id);

      if (!entry || entry.appliedCategory !== wp.category) {
        entry?.marker.remove();
        const el = buildMarkerElement(wp.category);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onTapRef.current(wp);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([wp.lon, wp.lat])
          .addTo(map);
        entry = { marker, appliedCategory: wp.category };
        markersRef.current.set(wp.id, entry);
      } else {
        entry.marker.setLngLat([wp.lon, wp.lat]);
      }
    }
    for (const [id, entry] of markersRef.current) {
      if (!seen.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [mapRef, waypoints]);

  // Fade markers below the visibility zoom threshold.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const visible = map.getZoom() >= VISIBLE_FROM_ZOOM;
      for (const { marker } of markersRef.current.values()) {
        marker.getElement().style.opacity = visible ? '1' : '0';
        marker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
      }
    };
    update();
    map.on('zoom', update);
    return () => {
      map.off('zoom', update);
    };
  }, [mapRef, waypoints]);

  // Cleanup on unmount.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.forEach((e) => e.marker.remove());
      markers.clear();
    };
  }, []);
}

function buildMarkerElement(category: WaypointCategory): HTMLDivElement {
  const root = document.createElement('div');
  root.className = `waypoint-marker waypoint-marker--${category}`;
  root.appendChild(buildIconElement(CATEGORY_ICON[category], { size: 24 }));
  return root;
}
