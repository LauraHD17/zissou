// Watches own-ship vs saved hazard waypoints. Ticks at 1 Hz. When within
// HAZARD_ALARM_METERS of a hazard AND heading toward it (or own-COG unknown),
// raises the silent AlarmBanner. Clears automatically when the boat moves
// away or turns off the heading.
//
// Silent by design — hazards can be many and chirping for each would
// fatigue. The banner's red border flash is enough signal at the helm.

import { useEffect } from 'react';
import { clearAlarmIfKind, raiseAlarm } from '../alarm/alarmStore';
import { useSelf } from '../signalk/useSignalK';
import { useNowMs } from '../utils/clock';
import { haversineMeters, validPosition } from '../utils/geometry';
import { HAZARD_ALARM_METERS, isHeadingTowardHazard } from '../utils/threat';
import { useWaypoints } from './waypointStore';

export function useHazardProximityWatch(): void {
  const waypoints = useWaypoints();
  const self = useSelf();
  const now = useNowMs(1000); // re-evaluate every second while position is static

  useEffect(() => {
    const hazards = waypoints.filter((w) => w.category === 'hazard');
    const pos = validPosition(self);

    if (hazards.length === 0 || !pos) {
      clearAlarmIfKind('hazard-proximity');
      return;
    }

    // Find the worst (closest) hazard we're heading into.
    let worst: { label: string; distM: number } | null = null;
    for (const h of hazards) {
      const hazPos = { latitude: h.lat, longitude: h.lon };
      const distM = haversineMeters(pos, hazPos);
      if (distM >= HAZARD_ALARM_METERS) continue;
      if (!isHeadingTowardHazard(self, hazPos)) continue;
      if (!worst || distM < worst.distM) {
        worst = { label: h.label || 'Hazard', distM };
      }
    }

    if (worst) {
      raiseAlarm({
        kind: 'hazard-proximity',
        message: `Hazard ahead — ${worst.label} ${Math.round(worst.distM)} m`,
      });
    } else {
      clearAlarmIfKind('hazard-proximity');
    }
    // Granular deps: `self` is copy-on-write per delta (fresh reference on
    // every update, even when nothing we read changed) — depend on the
    // primitives the body reads (position lat/lon + cog) + the 1 Hz tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, self?.position?.latitude, self?.position?.longitude, self?.cog, now]);
}
