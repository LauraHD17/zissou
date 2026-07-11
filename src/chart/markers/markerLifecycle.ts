// Shared lifecycle for single (non-collection) DOM markers — own-ship, MOB,
// and the route destination pin. Each kept a private markerRef and hand-rolled
// the same create-once-or-move / remove-when-absent / cleanup-on-unmount dance.
//
// reconcileSingleMarker is a plain function (not a hook) so callers keep their
// own useEffect with an explicit dependency array — eslint's exhaustive-deps
// still sees the real deps, and each marker's tuned update semantics stay in
// its own file.

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { MutableRefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

type PositionAnchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

type SingleMarkerRef = MutableRefObject<maplibregl.Marker | null>;

/**
 * Sync a single marker to `lngLat`, storing it in `markerRef`:
 *   - null lngLat        → remove the marker (if any) and return null.
 *   - opts.recreate      → always tear down and rebuild (guarantees the DOM is
 *                          in sync with state; some markers rely on this).
 *   - otherwise          → create once, then move via setLngLat on later calls.
 * Returns the live marker (or null) so callers can do per-update work on its
 * element (e.g. own-ship heading rotation).
 */
export function reconcileSingleMarker(
  map: MapLibreMap,
  markerRef: SingleMarkerRef,
  lngLat: [number, number] | null,
  buildEl: () => HTMLElement,
  opts: { anchor?: PositionAnchor; recreate?: boolean } = {},
): maplibregl.Marker | null {
  if (!lngLat) {
    markerRef.current?.remove();
    markerRef.current = null;
    return null;
  }
  if (opts.recreate) {
    markerRef.current?.remove();
    markerRef.current = null;
  }
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({
      element: buildEl(),
      anchor: opts.anchor ?? 'center',
    })
      .setLngLat(lngLat)
      .addTo(map);
  } else {
    markerRef.current.setLngLat(lngLat);
  }
  return markerRef.current;
}

/** Remove + null a single-marker ref when the component unmounts. */
export function useMarkerCleanup(markerRef: SingleMarkerRef): void {
  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [markerRef],
  );
}
