import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { buildIconElement } from '../../icons';
import { useActiveDestination } from '../../waypoints/destinationStore';

export function useDestinationMarker(mapRef: RefObject<maplibregl.Map | null>) {
  const dest = useActiveDestination();
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!dest) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = `destination-marker destination-marker--${dest.source}`;
      el.appendChild(buildIconElement('pin', { size: 32 }));
      markerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'bottom', // pin point sits ON the coordinate
      })
        .setLngLat([dest.position.longitude, dest.position.latitude])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([dest.position.longitude, dest.position.latitude]);
      const el = markerRef.current.getElement();
      el.className = `destination-marker destination-marker--${dest.source}`;
    }
  }, [mapRef, dest]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );
}
