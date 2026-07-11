// Angle conversions and wrapping — one tested home for the deg/rad and
// modulo-360/2π idioms that were re-derived across geometry, bearings, threat,
// and the compass store. Sign/modulo mistakes are a classic footgun; keeping
// them here means they're written (and tested) once.

export const TWO_PI = Math.PI * 2;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wrap radians into [0, 2π). */
export function normalizeRad(rad: number): number {
  return ((rad % TWO_PI) + TWO_PI) % TWO_PI;
}

/** Wrap degrees into [0, 360). */
export function wrapDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Signed smallest angle from `from` to `target`, in radians, in the range
 * (-π, π]. Positive = target is clockwise of from. Use for "how far, and which
 * way, to turn" comparisons.
 */
export function shortestAngleDelta(target: number, from: number): number {
  const d = normalizeRad(target - from);
  return d > Math.PI ? d - TWO_PI : d;
}
