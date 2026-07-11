import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { isVesselStale, isValidCogRad } from '../../signalk/types';
import type { Position, Vessel } from '../../signalk/types';
import { validPosition } from '../../utils/geometry';
import { radToDeg } from '../../utils/angles';
import { computeThreatBand, type ThreatBand } from '../../utils/threat';
import {
  reconcileMarkerCollection,
  useMarkerCollectionCleanup,
  type MarkerCollectionEntry,
} from './markerCollection';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface MarkerEntry extends MarkerCollectionEntry {
  hasHeading: boolean; // chevron (true) vs circle (false)
  // Latest vessel snapshot — vessels are copy-on-write, so the click handler
  // must read the current object here, not close over a stale one.
  vessel: Vessel;
  // Last DOM-applied values — skip writes when nothing changed.
  appliedBand: ThreatBand | null;
  appliedStale: boolean | null;
  appliedCogDeg: number | null;
}

// A target with its per-tick derived display state computed once.
interface PreparedTarget {
  vessel: Vessel;
  pos: Position;
  isStale: boolean;
  band: ThreatBand;
  cogDeg: number | null;
  hasHeading: boolean;
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
    const prepared: PreparedTarget[] = [];
    for (const vessel of targets) {
      const pos = validPosition(vessel);
      if (!pos) continue; // implausible/missing position → no marker
      const isStale = isVesselStale(vessel, now);
      const cogDeg = isValidCogRad(vessel.cog) ? radToDeg(vessel.cog) : null;
      prepared.push({
        vessel,
        pos,
        isStale,
        band: computeThreatBand(vessel, self, isStale),
        cogDeg,
        hasHeading: cogDeg != null,
      });
    }

    reconcileMarkerCollection({
      map,
      markers: markersRef.current,
      items: prepared,
      keyOf: (p) => p.vessel.context,
      lngLatOf: (p) => [p.pos.longitude, p.pos.latitude],
      // Shape flips between chevron (has heading) and circle — rebuild the el.
      shouldRecreate: (p, entry) => entry.hasHeading !== p.hasHeading,
      create: (p) => {
        const el = buildMarkerElement(p.hasHeading);
        const context = p.vessel.context;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          // Look up the CURRENT vessel — the closure would otherwise hand the
          // detail panel a snapshot frozen at marker-creation time.
          const current = markersRef.current.get(context)?.vessel;
          if (current) onTapRef.current?.(current);
        });
        // Pointer cursor so it reads as tappable.
        el.style.cursor = 'pointer';
        return {
          marker: new maplibregl.Marker({ element: el, anchor: 'center' }),
          hasHeading: p.hasHeading,
          vessel: p.vessel,
          appliedBand: null,
          appliedStale: null,
          appliedCogDeg: null,
        };
      },
      update: (p, entry) => {
        entry.vessel = p.vessel;

        // Skip className write if band/stale unchanged — DOM writes cause layout
        // thrash on busy harbors with many vessels updating each tick.
        if (entry.appliedBand !== p.band || entry.appliedStale !== p.isStale) {
          entry.marker.getElement().className = [
            'ais-target-marker',
            `ais-target-marker--${p.band}`,
            p.isStale && 'ais-target-marker--stale',
          ]
            .filter(Boolean)
            .join(' ');
          entry.appliedBand = p.band;
          entry.appliedStale = p.isStale;
        }

        if (p.cogDeg != null && entry.appliedCogDeg !== p.cogDeg) {
          const svg = entry.marker.getElement().querySelector<SVGSVGElement>('svg');
          if (svg) svg.style.transform = `rotate(${p.cogDeg}deg)`;
          entry.appliedCogDeg = p.cogDeg;
        }

        entry.marker
          .getElement()
          .setAttribute('aria-label', `${p.vessel.name || 'Unknown vessel'} — ${p.band}`);
      },
    });
  }, [mapRef, targets, self]);

  useMarkerCollectionCleanup(markersRef);
}

// A real <button> (not a click-only div): keyboard focusable, exposed to
// assistive tech, and CSS gives it the AAA 44×44 hit area around the glyph.
function buildMarkerElement(hasHeading: boolean): HTMLButtonElement {
  const root = document.createElement('button');
  root.type = 'button';

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
