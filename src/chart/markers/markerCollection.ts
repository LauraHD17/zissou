// Shared add / update / remove diffing for keyed marker collections — AIS
// targets, saved waypoints, and route via-points. All three kept a
// Map<key, entry> ref and hand-rolled the same reconcile: a `seen` set, a
// get-or-(re)create loop, setLngLat, then a second pass removing markers whose
// key vanished. Each marker's own element-building and per-tick DOM updates
// stay in the create/update callbacks, so bespoke behavior (AIS band/stale/COG
// write-suppression, waypoint category glyphs) is preserved exactly.
//
// reconcileMarkerCollection is a plain function (not a hook) so callers keep
// their own useEffect + explicit dependency array.

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface MarkerCollectionEntry {
  marker: maplibregl.Marker;
}

/**
 * Sync `markers` (a keyed ref-map) to `items`:
 *   - new key                → create() a marker, place + add it.
 *   - shouldRecreate() true   → tear the old marker down and create() a fresh
 *                               one (shape changed, e.g. chevron ↔ circle).
 *   - existing key            → move it via setLngLat.
 *   - key no longer in items  → remove the marker and drop the entry.
 * update() runs after create-or-move for every current item (apply className,
 * rotation, aria-label, and store the latest item on the entry).
 *
 * create() must return a marker that is NOT yet added to the map (this function
 * calls setLngLat + addTo); build the element and wire click handlers there.
 */
export function reconcileMarkerCollection<T, E extends MarkerCollectionEntry>(params: {
  map: MapLibreMap;
  markers: Map<string, E>;
  items: T[];
  keyOf: (item: T) => string;
  lngLatOf: (item: T) => [number, number];
  create: (item: T) => E;
  shouldRecreate?: (item: T, entry: E) => boolean;
  update?: (item: T, entry: E) => void;
}): void {
  const { map, markers, items, keyOf, lngLatOf, create, shouldRecreate, update } = params;

  const seen = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    seen.add(key);

    let entry = markers.get(key);
    if (!entry || shouldRecreate?.(item, entry)) {
      entry?.marker.remove();
      entry = create(item);
      entry.marker.setLngLat(lngLatOf(item)).addTo(map);
      markers.set(key, entry);
    } else {
      entry.marker.setLngLat(lngLatOf(item));
    }
    update?.(item, entry);
  }

  for (const [key, entry] of markers) {
    if (!seen.has(key)) {
      entry.marker.remove();
      markers.delete(key);
    }
  }
}

/** Remove every marker + clear the ref-map when the component unmounts. */
export function useMarkerCollectionCleanup<E extends MarkerCollectionEntry>(
  markersRef: MutableRefObject<Map<string, E>>,
): void {
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
    };
  }, [markersRef]);
}
