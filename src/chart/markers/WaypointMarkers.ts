// Saved waypoints rendered as DOM markers on the chart. All sage; icon
// shape differentiates category. Faded out below zoom 11 to reduce clutter
// at low zoom (active Go-To destination always visible — separate marker).

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { buildIconElement, type IconName } from '../../icons';
import { useWaypoints } from '../../waypoints/waypointStore';
import type { SavedWaypoint, WaypointCategory } from '../../types/nav';
import { reconcileMarkerCollection, useMarkerCollectionCleanup } from './markerCollection';

const CATEGORY_ICON: Record<WaypointCategory, IconName> = {
  mooring: 'mooringBuoy',
  anchorage: 'anchor',
  hazard: 'hazard',
  poi: 'star',
};

const VISIBLE_FROM_ZOOM = 11;

interface MarkerEntry {
  marker: maplibregl.Marker;
  appliedCategory: WaypointCategory;
  // Latest waypoint — the click handler reads it here so a label/notes edit
  // (which doesn't recreate the marker) still opens fresh data.
  waypoint: SavedWaypoint;
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
    reconcileMarkerCollection({
      map,
      markers: markersRef.current,
      items: waypoints,
      keyOf: (wp) => wp.id,
      lngLatOf: (wp) => [wp.lon, wp.lat],
      // Category change swaps the glyph — rebuild the marker element.
      shouldRecreate: (wp, entry) => entry.appliedCategory !== wp.category,
      create: (wp) => {
        const el = buildMarkerElement(wp.category);
        const id = wp.id;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          // Look up the CURRENT waypoint — a label/notes edit updates the entry
          // without recreating the marker, so the closure would be stale.
          const current = markersRef.current.get(id)?.waypoint;
          if (current) onTapRef.current(current);
        });
        return {
          marker: new maplibregl.Marker({ element: el, anchor: 'center' }),
          appliedCategory: wp.category,
          waypoint: wp,
        };
      },
      update: (wp, entry) => {
        entry.waypoint = wp;
        entry.marker
          .getElement()
          .setAttribute('aria-label', `${wp.label || 'Waypoint'} — ${wp.category}`);
      },
    });
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

  useMarkerCollectionCleanup(markersRef);
}

// A real <button> (not a click-only div): keyboard focusable, exposed to
// assistive tech, and CSS gives it the AAA 44×44 hit area around the glyph.
function buildMarkerElement(category: WaypointCategory): HTMLButtonElement {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = `waypoint-marker waypoint-marker--${category}`;
  root.appendChild(buildIconElement(CATEGORY_ICON[category], { size: 24 }));
  return root;
}
