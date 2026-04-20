import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useRouteTideAlert } from './useRouteTideAlert';
import { formatLocalTime } from '../utils/clock';
import { useActiveDestination } from '../waypoints/destinationStore';
import { OverlayPill } from '../ui/OverlayPill';

interface Props {
  mapRef: RefObject<maplibregl.Map | null>;
}

export function RouteTidePill({ mapRef }: Props) {
  const alert = useRouteTideAlert(mapRef);
  const dest = useActiveDestination();
  if (!alert || alert.severity === 'clear') return null;

  const { minEffectiveFt, requiredFt, severity, safeUntil, nextSafeFrom } = alert;

  let headline: string;
  if (severity === 'warn' && safeUntil) {
    headline = `Safe until ${formatLocalTime(safeUntil)}`;
  } else if (severity === 'warn') {
    headline = 'Shallow water — unsafe now';
  } else if (nextSafeFrom) {
    headline = `Safe from ${formatLocalTime(nextSafeFrom)}`;
  } else {
    headline = 'Shallow water on route';
  }

  const dismissKey = dest
    ? `route-tide:${dest.setAt}:${dest.position.latitude.toFixed(4)}:${dest.position.longitude.toFixed(4)}`
    : 'route-tide:none';

  return (
    <OverlayPill
      className={`route-tide route-tide--${severity}`}
      dismissKey={dismissKey}
      dismissLabel="Hide passage check"
      ariaLabel={`Passage check: ${headline}. Lowest water ahead ${minEffectiveFt.toFixed(1)} ft; need ${requiredFt.toFixed(1)} ft.`}
    >
      <span className="route-tide__primary">{headline}</span>
      <span className="route-tide__meta">
        Min {minEffectiveFt.toFixed(1)} ft · need {requiredFt.toFixed(1)} ft
      </span>
    </OverlayPill>
  );
}
