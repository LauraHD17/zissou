// Coarse heuristic for collision avoidance — distance + closing speed (NOT
// full CPA/TCPA). Conservative: missing/stale data always returns 'monitor'
// so bad data never drives alarms.

import { isValidCogRad, isValidSogMs } from '../signalk/types';
import type { Position, Vessel } from '../signalk/types';
import { bearingRadians, haversineNm, isPlausiblePosition } from './geometry';

export type ThreatBand = 'monitor' | 'caution' | 'danger';

const NM_TO_M = 1852;

/** Hazards beyond this range drop off the AIS list to keep the panel focused
 *  on immediate concerns. Own-ship is rarely a collision risk for a ledge
 *  more than 2 nm away — if the operator is cruising, the hazard will enter
 *  range before it matters. */
export const HAZARD_LIST_RANGE_NM = 2;

/** Distance at which the alarm fires, independent of motion. */
export const HAZARD_ALARM_METERS = 200;

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

  const tcpaMin = distMeters / closingMs / 60;

  if (distNm < 0.5 && tcpaMin < 3) return 'danger';
  if (distNm < 1 && tcpaMin < 8) return 'caution';
  if (distNm < 2 && tcpaMin < 15) return 'caution';

  return 'monitor';
}

/**
 * Threat band for a static hazard point. Simpler than vessel banding — no
 * closing-speed math, just distance. Returns null for hazards outside
 * HAZARD_LIST_RANGE_NM so callers can drop them from the list.
 *
 *   danger  — within HAZARD_ALARM_METERS
 *   caution — within 0.5 nm
 *   monitor — within HAZARD_LIST_RANGE_NM
 *   null    — farther (hide)
 */
export function computeHazardThreatBand(
  hazardPos: Position,
  self: Vessel | undefined,
): { band: ThreatBand; distanceNm: number } | null {
  if (!self?.position || !isPlausiblePosition(self.position)) return null;

  const distNm = haversineNm(self.position, hazardPos);
  if (distNm > HAZARD_LIST_RANGE_NM) return null;

  const distMeters = distNm * NM_TO_M;
  if (distMeters < HAZARD_ALARM_METERS) return { band: 'danger', distanceNm: distNm };
  if (distNm < 0.5) return { band: 'caution', distanceNm: distNm };
  return { band: 'monitor', distanceNm: distNm };
}

/**
 * True when own-ship's COG has us heading toward the hazard (within ±60° of
 * the bearing from us to the hazard). Anchored/drifting boats with unknown
 * COG get `true` — can't prove they're not drifting into it, and the hazard
 * is still nearby, so surface the alarm. Used for the alarm trigger, not the
 * list banding (banding stays orientation-independent so the list is stable).
 */
export function isHeadingTowardHazard(self: Vessel | undefined, hazardPos: Position): boolean {
  if (!self?.position) return false;
  if (!isValidCogRad(self.cog)) return true; // unknown COG → conservative
  const bearingToHazardRad = bearingRadians(self.position, hazardPos);
  const deltaRad = Math.abs(angleDeltaRad(self.cog as number, bearingToHazardRad));
  const sixtyDegRad = (60 * Math.PI) / 180;
  return deltaRad <= sixtyDegRad;
}

function angleDeltaRad(a: number, b: number): number {
  const twoPi = 2 * Math.PI;
  let d = ((a - b) % twoPi + twoPi) % twoPi;
  if (d > Math.PI) d -= twoPi;
  return d;
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
