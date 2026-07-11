import { normalizeRad, radToDeg } from './angles';

export type CompassOctant = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const ABSOLUTE_PHRASE: Record<CompassOctant, string> = {
  N: 'to your north',
  NE: 'to your northeast',
  E: 'to your east',
  SE: 'to your southeast',
  S: 'to your south',
  SW: 'to your southwest',
  W: 'to your west',
  NW: 'to your northwest',
};

/** Relative bearing (target bearing minus own heading) → bow/port/starboard/stern phrase. */
export function formatRelativeBearing(relativeRad: number): string {
  const deg = normalizeDegrees(relativeRad);
  if (deg >= 337.5 || deg < 22.5) return 'off your bow';
  if (deg < 67.5) return 'off your starboard bow';
  if (deg < 112.5) return 'to your starboard';
  if (deg < 157.5) return 'off your starboard stern';
  if (deg < 202.5) return 'behind you';
  if (deg < 247.5) return 'off your port stern';
  if (deg < 292.5) return 'to your port';
  return 'off your port bow';
}

/** Absolute compass bearing → cardinal phrase. Used when own heading is unknown. */
export function formatAbsoluteBearing(radians: number): string {
  return ABSOLUTE_PHRASE[compassOctant(radians)];
}

/** 8-point compass octant from radians. */
export function compassOctant(radians: number): CompassOctant {
  const deg = normalizeDegrees(radians);
  if (deg >= 337.5 || deg < 22.5) return 'N';
  if (deg < 67.5) return 'NE';
  if (deg < 112.5) return 'E';
  if (deg < 157.5) return 'SE';
  if (deg < 202.5) return 'S';
  if (deg < 247.5) return 'SW';
  if (deg < 292.5) return 'W';
  return 'NW';
}

/** Marine-style bearing: "090° E" — 3-digit zero-padded with compass octant. */
export function formatCompassBearing(radians: number): string {
  const deg = Math.round(normalizeDegrees(radians)) % 360;
  return `${String(deg).padStart(3, '0')}° ${compassOctant(radians)}`;
}

function normalizeDegrees(radians: number): number {
  return radToDeg(normalizeRad(radians));
}
