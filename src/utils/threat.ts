// Coarse heuristic for collision avoidance — distance + closing speed (NOT
// full CPA/TCPA). Conservative: missing/stale data always returns 'monitor'
// so bad data never drives alarms.

import { isValidCogRad, isValidSogMs } from '../signalk/types';
import type { Position, Vessel } from '../signalk/types';
import { bearingRadians, haversineNm, isPlausiblePosition } from './geometry';

export type ThreatBand = 'monitor' | 'caution' | 'danger';

const NM_TO_M = 1852;

/**
 *   danger  — within 200m, OR within 0.5 nm and closing in <3 min
 *   caution — within 1 nm closing in <8 min, OR within 2 nm closing in <15 min,
 *             OR within 500m without movement data
 *   monitor — everything else
 *
 * Stale, positionless, and invalid-position targets always return 'monitor' —
 * bad data never drives collision warnings.
 */
export function computeThreatBand(
  vessel: Vessel,
  self: Vessel | undefined,
  isStale: boolean,
): ThreatBand {
  if (isStale) return 'monitor';
  if (!vessel.position || !isPlausiblePosition(vessel.position)) return 'monitor';
  if (!self?.position) return 'monitor';

  const distNm = haversineNm(self.position, vessel.position);
  const distMeters = distNm * NM_TO_M;

  if (distMeters < 200) return 'danger';

  const haveMotion =
    isValidSogMs(self.sog) &&
    isValidCogRad(self.cog) &&
    isValidSogMs(vessel.sog) &&
    isValidCogRad(vessel.cog);

  if (!haveMotion) {
    return distMeters < 500 ? 'caution' : 'monitor';
  }

  const closingMs = closingSpeedMs(
    self.position,
    self.sog as number,
    self.cog as number,
    vessel.position,
    vessel.sog as number,
    vessel.cog as number,
  );

  if (closingMs <= 0.1) return 'monitor';

  const tcpaMin = (distMeters / closingMs) / 60;

  if (distNm < 0.5 && tcpaMin < 3) return 'danger';
  if (distNm < 1 && tcpaMin < 8) return 'caution';
  if (distNm < 2 && tcpaMin < 15) return 'caution';

  return 'monitor';
}

/**
 * Closing speed (m/s) — positive = gap shrinking. Projection of relative
 * velocity onto the bearing from A to B.
 */
export function closingSpeedMs(
  posA: Position,
  sogA: number,
  cogA: number,
  posB: Position,
  sogB: number,
  cogB: number,
): number {
  const vAe = sogA * Math.sin(cogA);
  const vAn = sogA * Math.cos(cogA);
  const vBe = sogB * Math.sin(cogB);
  const vBn = sogB * Math.cos(cogB);

  const bearing = bearingRadians(posA, posB);
  const sepE = Math.sin(bearing);
  const sepN = Math.cos(bearing);

  return (vAe - vBe) * sepE + (vAn - vBn) * sepN;
}
