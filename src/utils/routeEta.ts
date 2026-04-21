// Route math — total distance + context-aware ETA across one or more legs.
// A 1-waypoint route is equivalent to the old single-pin Go-To: total
// distance = haversine(own, dest), ETA = dist / speed.

import { isValidSogMs } from '../signalk/types';
import type { Vessel } from '../signalk/types';
import type { RouteWaypoint } from '../types/nav';
import { haversineNm, isPlausiblePosition } from './geometry';
import {
  computeDetectedCruisingKn,
  readCruisingSpeedSamples,
  resolveCruisingSpeedKn,
} from '../prefs/cruisingSpeedStore';
import { readUserPrefs } from '../prefs/userPrefsStore';
import { msToKnots } from './units';

/** Underway threshold — below this the ETA uses cruising speed instead of
 *  instantaneous SOG, so a planned route still has a meaningful ETA when
 *  the boat is anchored or drifting at the dock. */
const UNDERWAY_KN = 0.5;

export interface RouteEta {
  totalNm: number;
  /** ETA in minutes. Null when own position is missing (can't measure from). */
  minutes: number | null;
  /** Which speed the ETA used — 'sog' when underway, 'cruising' otherwise. */
  speedSource: 'sog' | 'cruising';
  /** The speed that was actually applied, in knots. */
  speedKn: number;
}

/** Total nm along own-ship → wp[0] → wp[1] → … → wp[last]. Returns 0 if own
 *  position is missing or the route is empty. */
export function totalRouteNm(waypoints: RouteWaypoint[], self: Vessel | undefined): number {
  if (waypoints.length === 0) return 0;
  const selfPos = self?.position;
  if (!selfPos || !isPlausiblePosition(selfPos)) return 0;

  let total = haversineNm(selfPos, waypoints[0].position);
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += haversineNm(waypoints[i].position, waypoints[i + 1].position);
  }
  return total;
}

/**
 * ETA across the full route. Uses current SOG when underway (≥ 0.5 kn),
 * otherwise falls back to the detected/override cruising speed so a stopped
 * boat still sees a useful "how long would this take" estimate.
 */
export function computeRouteEta(waypoints: RouteWaypoint[], self: Vessel | undefined): RouteEta {
  const totalNm = totalRouteNm(waypoints, self);
  const sogKn = isValidSogMs(self?.sog) ? msToKnots(self!.sog) : 0;
  const underway = sogKn >= UNDERWAY_KN;
  let speedKn: number;
  let speedSource: 'sog' | 'cruising';
  if (underway) {
    speedKn = sogKn;
    speedSource = 'sog';
  } else {
    const detected = computeDetectedCruisingKn(readCruisingSpeedSamples());
    speedKn = resolveCruisingSpeedKn(readUserPrefs().propulsion.cruisingSpeedKn, detected);
    speedSource = 'cruising';
  }

  if (totalNm === 0 || speedKn <= 0) {
    return { totalNm, minutes: null, speedSource, speedKn };
  }
  return {
    totalNm,
    minutes: (totalNm / speedKn) * 60,
    speedSource,
    speedKn,
  };
}
