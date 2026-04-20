// Top-right pill displayed when a Go-To destination is active.
// Format: → 087° E · 2.3 nm · 22 min
// Tap → action sheet with Save / Clear options.

import { useState } from 'react';
import { useSelf } from '../../signalk/useSignalK';
import { isValidSogMs } from '../../signalk/types';
import { bearingRadians, haversineNm, isPlausiblePosition } from '../../utils/geometry';
import { formatCompassBearing } from '../../utils/bearings';
import { formatDistance, msToKnots } from '../../utils/units';
import { formatLocalTime } from '../../utils/clock';
import { SlidePanel } from '../../ui/SlidePanel';
import {
  clearDestination,
  useActiveDestination,
} from '../../waypoints/destinationStore';

export function DestinationWidget() {
  const dest = useActiveDestination();
  const self = useSelf();
  const [actionsOpen, setActionsOpen] = useState(false);

  if (!dest) return null;

  const ownPos = self?.position;
  let bearing = '—';
  let distance = '—';
  let eta = '—';

  if (ownPos && isPlausiblePosition(ownPos)) {
    const distNm = haversineNm(ownPos, dest.position);
    distance = formatDistance(distNm);
    bearing = formatCompassBearing(bearingRadians(ownPos, dest.position));
    eta = formatEta(distNm, self?.sog);
  }

  const label = dest.label ?? 'destination';

  return (
    <>
      <button
        type="button"
        className="destination-widget"
        onClick={() => setActionsOpen(true)}
        aria-label={`Destination ${label}: ${bearing}, ${distance}, ${eta}. Tap for options.`}
      >
        <span aria-hidden="true">→ </span>
        <span className="destination-widget__bearing">{bearing}</span>
        <span aria-hidden="true"> · </span>
        <span className="destination-widget__distance">{distance}</span>
        <span aria-hidden="true"> · </span>
        <span className="destination-widget__eta">{eta}</span>
      </button>

      {actionsOpen && (
        <SlidePanel open onClose={() => setActionsOpen(false)} labelledBy="dest-actions-title">
          <h2 id="dest-actions-title" className="action-sheet__title">
            {label}
          </h2>
          <p className="action-sheet__meta">{bearing} · {distance} · {eta}</p>
          <div className="action-sheet__buttons">
            <button
              type="button"
              className="action-sheet__btn"
              onClick={() => {
                clearDestination();
                setActionsOpen(false);
              }}
            >
              Clear destination
            </button>
            {/* Save to waypoints lands in Phase 2b */}
          </div>
        </SlidePanel>
      )}
    </>
  );
}

function formatEta(distNm: number, sogMs: number | undefined): string {
  if (!isValidSogMs(sogMs)) return '—';
  const sogKn = msToKnots(sogMs);
  if (sogKn < 0.5) return 'drifting';
  const etaMin = (distNm / sogKn) * 60;
  if (etaMin < 60) return `${Math.round(etaMin)} min`;
  if (etaMin < 120) {
    const h = Math.floor(etaMin / 60);
    const m = Math.round(etaMin % 60);
    return `${h}h ${m}m`;
  }
  // Long range: clock time, more honest than minute counts
  const arrival = new Date(Date.now() + etaMin * 60_000);
  return `ETA ${formatLocalTime(arrival)}`;
}
