import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { isValidCogRad } from '../../signalk/types';
import type { Vessel } from '../../signalk/types';
import { isPlausiblePosition } from '../../utils/geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function useOwnShipMarker(
  mapRef: RefObject<maplibregl.Map | null>,
  self: Vessel | undefined,
) {
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!self?.position || !isPlausiblePosition(self.position)) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        element: buildOwnShipElement(),
        anchor: 'center',
      })
        .setLngLat([self.position.longitude, self.position.latitude])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([self.position.longitude, self.position.latitude]);
    }

    const headingDeg = isValidCogRad(self.cog) ? (self.cog * 180) / Math.PI : 0;
    const triangle = markerRef.current
      .getElement()
      .querySelector<SVGSVGElement>('.own-ship-marker__triangle');
    if (triangle) triangle.style.transform = `rotate(${headingDeg}deg)`;
  }, [mapRef, self?.position?.latitude, self?.position?.longitude, self?.cog]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );
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
