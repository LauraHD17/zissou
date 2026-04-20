// Distinct red MOB marker at the activation point. Larger than AIS / waypoint
// markers (32 px) so it's findable at a glance from across the chart.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import { buildIconElement } from '../../icons';
import { useMOB } from '../../mob/mobStore';

export function useMOBMarker(mapRef: RefObject<maplibregl.Map | null>) {
  const mob = useMOB();
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!mob) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'mob-marker';
      el.appendChild(buildIconElement('mob', { size: 32 }));
      const label = document.createElement('span');
      label.className = 'mob-marker__label';
      label.textContent = 'MOB';
      el.appendChild(label);
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([mob.position.longitude, mob.position.latitude])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([mob.position.longitude, mob.position.latitude]);
    }
  }, [mapRef, mob]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );
}
