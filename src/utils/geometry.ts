// Positions are {latitude, longitude} in decimal degrees; bearings are
// radians from north clockwise.

import type { Position } from '../signalk/types';

const EARTH_RADIUS_NM = 3440.065;
const EARTH_RADIUS_M = 6_371_000;

export function isPlausiblePosition(p: Position | undefined): boolean {
  if (!p) return false;
  if (p.latitude === 0 && p.longitude === 0) return false;
  if (p.latitude < -90 || p.latitude > 90) return false;
  if (p.longitude < -180 || p.longitude > 180) return false;
  return true;
}

/** Great-circle distance in nautical miles between two positions. */
export function haversineNm(a: Position, b: Position): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

/** Bearing from `from` to `to`, in radians (0 = north, clockwise). */
export function bearingRadians(from: Position, to: Position): number {
  const la1 = toRad(from.latitude);
  const la2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  const twoPi = Math.PI * 2;
  return (Math.atan2(y, x) + twoPi) % twoPi;
}

/**
 * Project a position by `distanceM` meters along `bearingRad` from start.
 * Spherical-earth approximation — accurate enough for short ranges
 * (predictive heading vectors, dead-reckoning over a few minutes).
 */
export function projectPosition(
  start: Position,
  bearingRad: number,
  distanceM: number,
): Position {
  const delta = distanceM / EARTH_RADIUS_M;
  const phi1 = toRad(start.latitude);
  const lambda1 = toRad(start.longitude);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(bearingRad),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );

  return {
    latitude: (phi2 * 180) / Math.PI,
    longitude: (((lambda2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
