// Top-right pill displayed when a route (1..N waypoints) is active.
// Single-pin: → 087° E · 2.3 nm · 22 min
// Multi-pin: → 3 legs · 4.2 nm · 42 min
// Tap → action sheet with Save / Clear options.

import { useState } from 'react';
import { useSelf } from '../../signalk/useSignalK';
import { bearingRadians, isPlausiblePosition } from '../../utils/geometry';
import { formatCompassBearing } from '../../utils/bearings';
import { formatDistance } from '../../utils/units';
import { formatLocalTime } from '../../utils/clock';
import { SlidePanel } from '../../ui/SlidePanel';
import { clearRoute, useActiveRoute } from '../../waypoints/routeStore';
import { WaypointEditor } from '../../waypoints/WaypointEditor';
import { computeRouteEta } from '../../utils/routeEta';

export function DestinationWidget() {
  const route = useActiveRoute();
  const self = useSelf();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  if (!route || route.waypoints.length === 0) return null;

  const destWp = route.waypoints[route.waypoints.length - 1];
  const legCount = route.waypoints.length;
  const ownPos = self?.position;
  const ownKnown = !!ownPos && isPlausiblePosition(ownPos);

  const { totalNm, minutes } = computeRouteEta(route.waypoints, self);
  const distance = ownKnown ? formatDistance(totalNm) : '—';
  const etaText = ownKnown ? formatEtaMinutes(minutes) : '—';

  // Single-pin routes keep the classic bearing readout; multi-pin shows leg
  // count (bearing across a polyline isn't meaningful).
  const primary: string =
    legCount === 1 && ownKnown
      ? formatCompassBearing(bearingRadians(ownPos!, destWp.position))
      : `${legCount} ${legCount === 1 ? 'leg' : 'legs'}`;

  const label = destWp.label ?? 'destination';

  return (
    <>
      <button
        type="button"
        className="destination-widget"
        onClick={() => setActionsOpen(true)}
        aria-label={`Route to ${label}: ${primary}, ${distance}, ${etaText}. Tap for options.`}
      >
        <span aria-hidden="true">→ </span>
        <span className="destination-widget__bearing">{primary}</span>
        <span aria-hidden="true"> · </span>
        <span className="destination-widget__distance">{distance}</span>
        <span aria-hidden="true"> · </span>
        <span className="destination-widget__eta">{etaText}</span>
      </button>

      {actionsOpen && (
        <SlidePanel open onClose={() => setActionsOpen(false)} labelledBy="dest-actions-title">
          <h2 id="dest-actions-title" className="action-sheet__title">
            {label}
          </h2>
          <p className="action-sheet__meta">
            {primary} · {distance} · {etaText}
          </p>
          <div className="action-sheet__buttons">
            <button
              type="button"
              className="action-sheet__btn"
              onClick={() => {
                setActionsOpen(false);
                setSaveOpen(true);
              }}
            >
              Save this spot to waypoints
            </button>
            <button
              type="button"
              className="action-sheet__btn"
              onClick={() => {
                clearRoute();
                setActionsOpen(false);
              }}
            >
              {legCount > 1 ? 'Clear route' : 'Clear destination'}
            </button>
          </div>
        </SlidePanel>
      )}

      {saveOpen && (
        <WaypointEditor
          mode="create"
          position={destWp.position}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}

function formatEtaMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 120) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  }
  // Long range: clock time, more honest than minute counts
  const arrival = new Date(Date.now() + minutes * 60_000);
  return `ETA ${formatLocalTime(arrival)}`;
}
