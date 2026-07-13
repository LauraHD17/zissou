// SignalK stores raw spec values (m/s, radians, decimal degrees); these
// formatters output the marine-canonical-plus-English-translation pattern.

// Single source of truth for every conversion constant in the app —
// unitsSingleSource.test.ts fails the build if these literals appear anywhere
// else in src/. Need a conversion? Import from here, don't retype the number.
const MS_TO_KN = 1.9438444924;
const MS_TO_MPH = 2.2369362921;
const NM_TO_MILES = 1.15077945;
export const NM_TO_METERS = 1852;
export const MILE_TO_METERS = 1609.344;
const METERS_TO_YARDS = 1.0936133;
export const M_TO_FT = 3.28084;

export function metersToFeet(m: number): number {
  return m * M_TO_FT;
}

export function feetToMeters(ft: number): number {
  return ft / M_TO_FT;
}

// ── Speed ──────────────────────────────────────────────────────────────────

/** "13.0 knots (15 mph)" — primary knots, MPH translation in parens. */
export function formatSpeedKnMph(metersPerSec: number): string {
  const kn = metersPerSec * MS_TO_KN;
  const mph = metersPerSec * MS_TO_MPH;
  return `${kn.toFixed(1)} knots (${Math.round(mph)} mph)`;
}

export function msToKnots(metersPerSec: number): number {
  return metersPerSec * MS_TO_KN;
}

/** Inverse of msToKnots — for sources that report speed in knots (AIS wire
 *  format) feeding the store, which holds SignalK-spec m/s. */
export function knotsToMs(knots: number): number {
  return knots / MS_TO_KN;
}

export function msToMph(metersPerSec: number): number {
  return metersPerSec * MS_TO_MPH;
}

// ── Distance ───────────────────────────────────────────────────────────────

/**
 * Distance in the marine-canonical unit with a plain-English translation in parens.
 *   < 1 nm : "650 meters (711 yards)"
 *   ≥ 1 nm : "3.2 nautical miles (3.7 miles)"
 */
export function formatDistance(nauticalMiles: number): string {
  if (nauticalMiles < 1) {
    const meters = Math.round(nauticalMiles * NM_TO_METERS);
    const yards = Math.round(meters * METERS_TO_YARDS);
    return `${meters} meters (${yards} yards)`;
  }
  const miles = nauticalMiles * NM_TO_MILES;
  const nm = nauticalMiles < 10 ? nauticalMiles.toFixed(1) : String(Math.round(nauticalMiles));
  const mi = miles < 10 ? miles.toFixed(1) : String(Math.round(miles));
  return `${nm} nautical miles (${mi} miles)`;
}

// ── Position ───────────────────────────────────────────────────────────────

export function formatLat(lat: number | undefined): string {
  if (lat == null) return '—';
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
}

export function formatLon(lon: number | undefined): string {
  if (lon == null) return '—';
  return `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
}
