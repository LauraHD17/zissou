// Route tide assessment pill. Directive brutalist copy: single-line
// deadline clock when we have one; next-safe-window clock when we don't.
// Duration is deliberately omitted here — detail modal will surface it
// when we add one.

import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useRouteTideAlert } from './useRouteTideAlert';
import { formatLocalTime } from '../utils/clock';
import { useActiveDestination } from '../waypoints/destinationStore';
import { dismiss, useIsDismissed } from '../ui/dismissStore';
import { DismissButton } from '../ui/DismissButton';

interface Props {
  mapRef: RefObject<maplibregl.Map | null>;
}

export function RouteTidePill({ mapRef }: Props) {
  const alert = useRouteTideAlert(mapRef);
  const dest = useActiveDestination();
  const dismissKey = dest
    ? `route-tide:${dest.setAt}:${dest.position.latitude.toFixed(4)}:${dest.position.longitude.toFixed(4)}`
    : 'route-tide:none';
  const dismissed = useIsDismissed(dismissKey);
  if (!alert || alert.severity === 'clear' || dismissed) return null;

  const { minEffectiveFt, requiredFt, severity, safeUntil, nextSafeFrom } = alert;

  // Headline picks the most actionable statement.
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

  return (
    <div
      className={`route-tide route-tide--${severity}`}
      role="status"
      aria-label={`Passage check: ${headline}. Lowest water ahead ${minEffectiveFt.toFixed(1)} ft; need ${requiredFt.toFixed(1)} ft.`}
    >
      <DismissButton onClick={() => dismiss(dismissKey)} label="Hide passage check" />
      <span className="route-tide__primary">{headline}</span>
      <span className="route-tide__meta">
        Min {minEffectiveFt.toFixed(1)} ft · need {requiredFt.toFixed(1)} ft
      </span>
    </div>
  );
}
