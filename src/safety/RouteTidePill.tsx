import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useRouteTideAlert } from './useRouteTideAlert';
import { formatLocalTime } from '../utils/clock';
import { useActiveRoute } from '../waypoints/routeStore';
import { OverlayPill } from '../ui/OverlayPill';

interface Props {
  mapRef: RefObject<maplibregl.Map | null>;
}

export function RouteTidePill({ mapRef }: Props) {
  const alert = useRouteTideAlert(mapRef);
  const route = useActiveRoute();
  if (!alert || alert.severity === 'clear') return null;

  const destWp =
    route && route.waypoints.length > 0 ? route.waypoints[route.waypoints.length - 1] : null;
  const { minEffectiveFt, requiredFt, severity, safeUntil, nextSafeFrom } = alert;

  let headline: string;
  if (alert.tideIsEstimate) {
    headline = 'Shallow water on route — tide unknown';
  } else if (severity === 'warn' && safeUntil) {
    headline = `Safe until ${formatLocalTime(safeUntil)}`;
  } else if (severity === 'warn') {
    headline = 'Shallow water — unsafe now';
  } else if (nextSafeFrom) {
    headline = `Safe from ${formatLocalTime(nextSafeFrom)}`;
  } else {
    headline = 'Shallow water on route';
  }

  // Dismiss is per-route (scoped to the destination fingerprint + createdAt)
  // so setting a new route clears the dismissed state.
  const dismissKey =
    destWp && route
      ? `route-tide:${route.createdAt}:${destWp.position.latitude.toFixed(4)}:${destWp.position.longitude.toFixed(4)}`
      : 'route-tide:none';

  return (
    <OverlayPill
      className={`route-tide route-tide--${severity}`}
      dismissKey={dismissKey}
      dismissLabel="Hide passage check"
      ariaLabel={
        alert.tideIsEstimate
          ? `Passage check: ${headline}. Charted minimum ${minEffectiveFt.toFixed(1)} ft; need ${requiredFt.toFixed(1)} ft.`
          : `Passage check: ${headline}. Lowest water ahead ${minEffectiveFt.toFixed(1)} ft; need ${requiredFt.toFixed(1)} ft.`
      }
    >
      <span className="route-tide__primary">{headline}</span>
      <span className="route-tide__meta">
        {alert.tideIsEstimate
          ? `Charted ${minEffectiveFt.toFixed(1)} ft · need ${requiredFt.toFixed(1)} ft`
          : `Min ${minEffectiveFt.toFixed(1)} ft · need ${requiredFt.toFixed(1)} ft`}
      </span>
    </OverlayPill>
  );
}
