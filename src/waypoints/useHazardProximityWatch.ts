// Watches own-ship vs saved hazard waypoints. Ticks at 1 Hz. When within
// HAZARD_ALARM_METERS of a hazard AND heading toward it (or own-COG unknown),
// raises the silent AlarmBanner. Clears automatically when the boat moves
// away or turns off the heading.
//
// Silent by design — hazards can be many and chirping for each would
// fatigue. The banner's red border flash is enough signal at the helm.

import { useEffect } from 'react';
import { clearAlarm, raiseAlarm, readActiveAlarm } from '../alarm/alarmStore';
import { useSelf } from '../signalk/useSignalK';
import { useNowMs } from '../utils/clock';
import { haversineNm, isPlausiblePosition } from '../utils/geometry';
import { HAZARD_ALARM_METERS, isHeadingTowardHazard } from '../utils/threat';
import { useWaypoints } from './waypointStore';

const NM_TO_M = 1852;

export function useHazardProximityWatch(): void {
  const waypoints = useWaypoints();
  const self = useSelf();
  useNowMs(1000); // re-evaluate every second while position is static

  useEffect(() => {
    const hazards = waypoints.filter((w) => w.category === 'hazard');
    const alarm = readActiveAlarm();

    if (hazards.length === 0 || !self?.position || !isPlausiblePosition(self.position)) {
      if (alarm?.kind === 'hazard-proximity') clearAlarm();
      return;
    }

    // Find the worst (closest) hazard we're heading into.
    let worst: { label: string; distM: number } | null = null;
    for (const h of hazards) {
      const hazPos = { latitude: h.lat, longitude: h.lon };
      const distM = haversineNm(self.position, hazPos) * NM_TO_M;
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
    } else if (alarm?.kind === 'hazard-proximity') {
      clearAlarm();
    }
  }, [waypoints, self]);
}
