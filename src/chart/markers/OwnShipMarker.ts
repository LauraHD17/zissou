import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import type { Vessel } from '../../signalk/types';
import { validPosition } from '../../utils/geometry';
import { reconcileSingleMarker, useMarkerCleanup } from './markerLifecycle';
import {
  pickOwnShipHeadingRad,
  useCompassReading,
  useHeadingMode,
  type HeadingSource,
} from '../../compass/compassStore';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function useOwnShipMarker(
  mapRef: RefObject<maplibregl.Map | null>,
  self: Vessel | undefined,
) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Compass (phone build): swings the triangle instantly at rest, where GPS
  // course is noise. Underway, COG wins — see pickOwnShipHeadingRad.
  const compass = useCompassReading();
  const headingMode = useHeadingMode();
  // Hysteresis memory (which source steered last) + continuous unwrapped
  // angle so the CSS rotation transition always takes the short way around
  // (359°→1° must glide 2°, not spin 358° backwards).
  const sourceRef = useRef<HeadingSource | undefined>(undefined);
  const continuousDegRef = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const pos = validPosition(self);
    const marker = reconcileSingleMarker(
      map,
      markerRef,
      pos ? [pos.longitude, pos.latitude] : null,
      buildOwnShipElement,
      { anchor: 'center' },
    );
    if (!marker) return;

    const picked = pickOwnShipHeadingRad({
      cogRad: self?.cog,
      sogMs: self?.sog,
      compass,
      nowMs: Date.now(),
      prevSource: sourceRef.current,
      mode: headingMode,
    });
    sourceRef.current = picked?.source ?? sourceRef.current;

    const targetDeg = picked != null ? (picked.headingRad * 180) / Math.PI : 0;
    const prev = continuousDegRef.current;
    let continuousDeg = targetDeg;
    if (prev != null) {
      // Wrap the delta to [-180, 180] and accumulate — shortest-path spin.
      const delta = ((targetDeg - (((prev % 360) + 360) % 360) + 540) % 360) - 180;
      continuousDeg = prev + delta;
    }
    continuousDegRef.current = continuousDeg;

    const triangle = marker.getElement().querySelector<SVGSVGElement>('.own-ship-marker__triangle');
    if (triangle) triangle.style.transform = `rotate(${continuousDeg}deg)`;
    // Granular deps: self is copy-on-write per delta; we read position
    // lat/lon, cog, sog, plus the throttled compass reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, self?.position?.latitude, self?.position?.longitude, self?.cog, self?.sog, compass]);

  useMarkerCleanup(markerRef);
}

function buildOwnShipElement(): HTMLDivElement {
  // 56px container leaves 8px room for the ring's max scale (1.4× of 40px).
  const root = document.createElement('div');
  root.className = 'own-ship-marker';

  const pulse = document.createElement('div');
  pulse.className = 'own-ship-marker__pulse';
  pulse.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'own-ship-marker__triangle');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M 20 4 L 34 36 L 20 28 L 6 36 Z');
  svg.appendChild(path);

  root.append(pulse, svg);
  return root;
}
