// Positions are {latitude, longitude} in decimal degrees; bearings are
// radians from north clockwise.

import type { Position } from '../signalk/types';

const EARTH_RADIUS_NM = 3440.065;
const EARTH_RADIUS_M = 6_371_000;

/** Mid-coast Maine — used as a sun/tide/theme fallback before GPS fix. */
export const FALLBACK_POS: Position = { latitude: 44.4, longitude: -68.8 };

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
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
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
export function projectPosition(start: Position, bearingRad: number, distanceM: number): Position {
  const delta = distanceM / EARTH_RADIUS_M;
  const phi1 = toRad(start.latitude);
  const lambda1 = toRad(start.longitude);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(bearingRad),
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

/**
 * Sample a polyline (sequence of waypoint positions) evenly along its total
 * length, returning `samples + 1` points from the first to the last. Used to
 * scan charted depth under a multi-leg route without biasing long legs over
 * short ones. For `positions.length < 2`, echoes the input as-is.
 */
export function samplePolyline(positions: Position[], samples: number): Position[] {
  if (positions.length === 0) return [];
  if (positions.length === 1) return [positions[0]];
  if (samples <= 0) return [positions[0], positions[positions.length - 1]];

  const legLens: number[] = [];
  let total = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    const dLat = positions[i + 1].latitude - positions[i].latitude;
    // Weight longitude by cos(lat): a degree of longitude is shorter than a
    // degree of latitude away from the equator. Without this, E-W legs get
    // ~1.4× the sample density of N-S legs at 44°N — sparser shoal detection
    // on north-south passages.
    const midLatRad =
      (((positions[i].latitude + positions[i + 1].latitude) / 2) * Math.PI) / 180;
    const dLon = (positions[i + 1].longitude - positions[i].longitude) * Math.cos(midLatRad);
    const len = Math.hypot(dLat, dLon);
    legLens.push(len);
    total += len;
  }
  if (total === 0) return [positions[0]];

  const out: Position[] = [];
  for (let i = 0; i <= samples; i++) {
    const target = (i / samples) * total;
    let accum = 0;
    for (let j = 0; j < legLens.length; j++) {
      const next = accum + legLens[j];
      if (target <= next || j === legLens.length - 1) {
        const t = legLens[j] === 0 ? 0 : (target - accum) / legLens[j];
        out.push({
          latitude: positions[j].latitude + (positions[j + 1].latitude - positions[j].latitude) * t,
          longitude:
            positions[j].longitude + (positions[j + 1].longitude - positions[j].longitude) * t,
        });
        break;
      }
      accum = next;
    }
  }
  return out;
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
