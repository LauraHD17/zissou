import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { AIS_STALE_MS, isValidCogRad } from '../../signalk/types';
import type { Vessel } from '../../signalk/types';
import { isPlausiblePosition } from '../../utils/geometry';
import { computeThreatBand, type ThreatBand } from '../../utils/threat';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface MarkerEntry {
  marker: maplibregl.Marker;
  hasHeading: boolean; // chevron (true) vs circle (false)
  // Last DOM-applied values — skip writes when nothing changed.
  appliedBand: ThreatBand | null;
  appliedStale: boolean | null;
  appliedCogDeg: number | null;
}

interface Options {
  onTap?: (vessel: Vessel) => void;
}

export function useAISMarkers(
  mapRef: RefObject<maplibregl.Map | null>,
  targets: Vessel[],
  self: Vessel | undefined,
  { onTap }: Options = {},
) {
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const now = Date.now();
    const seen = new Set<string>();

    for (const v of targets) {
      if (!v.position || !isPlausiblePosition(v.position)) continue;
      seen.add(v.context);

      const isStale = now - v.lastUpdated > AIS_STALE_MS;
      const band = computeThreatBand(v, self, isStale);
      const cogDeg = isValidCogRad(v.cog) ? (v.cog * 180) / Math.PI : null;
      const hasHeading = cogDeg != null;

      let entry = markersRef.current.get(v.context);

      // Create or recreate (when the inner shape changes between chevron/circle).
      if (!entry || entry.hasHeading !== hasHeading) {
        entry?.marker.remove();
        const el = buildMarkerElement(hasHeading);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onTapRef.current?.(v);
        });
        // Pointer cursor so it reads as tappable.
        el.style.cursor = 'pointer';
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.position.longitude, v.position.latitude])
          .addTo(map);
        entry = {
          marker,
          hasHeading,
          appliedBand: null,
          appliedStale: null,
          appliedCogDeg: null,
        };
        markersRef.current.set(v.context, entry);
      } else {
        entry.marker.setLngLat([v.position.longitude, v.position.latitude]);
      }

      // Skip className write if band/stale unchanged — DOM writes cause layout
      // thrash on busy harbors with many vessels updating each tick.
      if (entry.appliedBand !== band || entry.appliedStale !== isStale) {
        const el = entry.marker.getElement();
        el.className = [
          'ais-target-marker',
          `ais-target-marker--${band}`,
          isStale && 'ais-target-marker--stale',
        ]
          .filter(Boolean)
          .join(' ');
        entry.appliedBand = band;
        entry.appliedStale = isStale;
      }

      if (cogDeg != null && entry.appliedCogDeg !== cogDeg) {
        const svg = entry.marker.getElement().querySelector<SVGSVGElement>('svg');
        if (svg) svg.style.transform = `rotate(${cogDeg}deg)`;
        entry.appliedCogDeg = cogDeg;
      }
    }

    for (const [context, entry] of markersRef.current) {
      if (!seen.has(context)) {
        entry.marker.remove();
        markersRef.current.delete(context);
      }
    }
  }, [mapRef, targets, self]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
    };
  }, []);
}

function buildMarkerElement(hasHeading: boolean): HTMLDivElement {
  const root = document.createElement('div');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  if (hasHeading) {
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 8 1 L 14 14 L 8 11 L 2 14 Z');
    svg.appendChild(path);
  } else {
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '5');
    svg.appendChild(circle);
  }

  root.appendChild(svg);
  return root;
}
