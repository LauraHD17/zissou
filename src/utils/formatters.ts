// Display formatters. The SignalK store holds raw spec values (m/s, radians,
// decimal degrees for position). Conversion to human-facing units happens here.

import type { Position, Vessel } from '../signalk/types';

const MS_TO_KN = 1.9438444924;
const MS_TO_MPH = 2.2369362921;
const NM_TO_MILES = 1.15077945;
const NM_TO_METERS = 1852;
const METERS_TO_YARDS = 1.0936133;

// ── Speed ──────────────────────────────────────────────────────────────────

/** "13.0 knots (15 mph)" — primary knots, MPH translation in parens. */
export function formatSpeedKnMph(metersPerSec: number): string {
  const kn = metersPerSec * MS_TO_KN;
  const mph = metersPerSec * MS_TO_MPH;
  return `${kn.toFixed(1)} knots (${Math.round(mph)} mph)`;
}

/** Convert m/s to knots (no formatting). */
export function msToKnots(metersPerSec: number): number {
  return metersPerSec * MS_TO_KN;
}

/** Convert m/s to mph (no formatting). */
export function msToMph(metersPerSec: number): number {
  return metersPerSec * MS_TO_MPH;
}

// ── Distance ───────────────────────────────────────────────────────────────

/**
 * Distance in the marine-canonical unit with a plain-English translation in parens.
 *   < 1 nm : "650 meters (711 yards)"
 *   ≥ 1 nm : "3.2 nautical miles (3.7 miles)"
 * Mirrors the knots/mph pattern — canonical unit primary, translation secondary.
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

// ── Bearings ───────────────────────────────────────────────────────────────

/** Relative bearing (target bearing minus own heading) → bow/port/starboard/stern phrase. */
export function formatRelativeBearing(relativeRad: number): string {
  const twoPi = Math.PI * 2;
  const r = ((relativeRad % twoPi) + twoPi) % twoPi;
  const deg = (r * 180) / Math.PI;
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
  const twoPi = Math.PI * 2;
  const r = ((radians % twoPi) + twoPi) % twoPi;
  const deg = (r * 180) / Math.PI;
  if (deg >= 337.5 || deg < 22.5) return 'to your north';
  if (deg < 67.5) return 'to your northeast';
  if (deg < 112.5) return 'to your east';
  if (deg < 157.5) return 'to your southeast';
  if (deg < 202.5) return 'to your south';
  if (deg < 247.5) return 'to your southwest';
  if (deg < 292.5) return 'to your west';
  return 'to your northwest';
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

export function isPlausiblePosition(p: Position | undefined): boolean {
  if (!p) return false;
  if (p.latitude === 0 && p.longitude === 0) return false;
  if (p.latitude < -90 || p.latitude > 90) return false;
  if (p.longitude < -180 || p.longitude > 180) return false;
  return true;
}

// ── Geometry ───────────────────────────────────────────────────────────────

export function haversineNm(a: Position, b: Position): number {
  const R = 3440.065;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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

// ── Plain-language vessel summary ──────────────────────────────────────────

export interface VesselNarrative {
  location: string;
  movement: string | null;
  qualifier: string | null;
  rawFacts: string;
}

export function buildVesselNarrative(
  vessel: Vessel,
  self: Vessel | undefined,
  now: number,
): VesselNarrative {
  const STALE_MS = 5 * 60 * 1000;
  const isStale = now - vessel.lastUpdated > STALE_MS;
  const rawFacts = buildRawFacts(vessel);
  const staleLine = isStale ? staleQualifier(now - vessel.lastUpdated) : null;

  if (!vessel.position) {
    return {
      location: 'Position unknown — static-only report',
      movement: null,
      qualifier: staleLine,
      rawFacts,
    };
  }

  if (!isPlausiblePosition(vessel.position)) {
    return {
      location: 'Reported position is invalid — ignoring',
      movement: null,
      qualifier: 'Likely a broken AIS transmitter',
      rawFacts,
    };
  }

  const selfPos = self?.position;
  let location: string;
  if (selfPos) {
    const dist = haversineNm(selfPos, vessel.position);
    const absBearing = bearingRadians(selfPos, vessel.position);
    const direction =
      self?.cog != null && self.cog <= Math.PI * 2
        ? formatRelativeBearing(absBearing - self.cog)
        : formatAbsoluteBearing(absBearing);
    location = capitalize(`${formatDistance(dist)} ${direction}`);
  } else {
    location = 'Position unknown from here';
  }

  const movement = capitalize(describeMovement(vessel, selfPos));

  return { location, movement, qualifier: staleLine, rawFacts };
}

function describeMovement(vessel: Vessel, selfPos: Position | undefined): string {
  if (vessel.navState === 'at anchor' || vessel.navState === 'moored') {
    return 'anchored';
  }
  if (vessel.sog == null) {
    return 'speed unknown';
  }
  // Guard against the 999 m/s "garbage" sentinel and other nonsense.
  if (vessel.sog < 0 || vessel.sog > 60) {
    return 'speed reported as implausible';
  }
  const knotsNow = msToKnots(vessel.sog);
  if (knotsNow < 0.5) {
    return 'stopped in the water';
  }
  const cogValid = vessel.cog != null && vessel.cog >= 0 && vessel.cog <= Math.PI * 2;
  const relation =
    cogValid && selfPos && vessel.position
      ? classifyCourseRelation(selfPos, vessel.position, vessel.cog!)
      : 'moving';
  return `${relation} at ${formatSpeedKnMph(vessel.sog)}`;
}

function classifyCourseRelation(
  selfPos: Position,
  targetPos: Position,
  targetCogRad: number,
): string {
  // Direction from target back to self — if target is heading this way, they converge.
  const reciprocal = bearingRadians(targetPos, selfPos);
  const delta = Math.abs(normalizeAngleRad(targetCogRad - reciprocal));
  const deltaDeg = (delta * 180) / Math.PI;
  if (deltaDeg < 45) return 'heading toward you';
  if (deltaDeg > 135) return 'moving away from you';
  return 'crossing your path';
}

function staleQualifier(ageMs: number): string {
  const mins = Math.round(ageMs / 60_000);
  return `Report is stale — ${mins} ${mins === 1 ? 'minute' : 'minutes'} old`;
}

function buildRawFacts(vessel: Vessel): string {
  const parts: string[] = [];
  if (vessel.mmsi) parts.push(`MMSI ${vessel.mmsi}`);
  if (vessel.sog != null && vessel.sog >= 0 && vessel.sog < 60) {
    const kn = msToKnots(vessel.sog);
    parts.push(`SOG ${kn.toFixed(1)} kn`);
  }
  if (vessel.cog != null && vessel.cog >= 0 && vessel.cog <= Math.PI * 2) {
    const deg = (vessel.cog * 180) / Math.PI;
    parts.push(`COG ${Math.round(deg)}°`);
  }
  if (vessel.position) {
    parts.push(`${formatLat(vessel.position.latitude)} ${formatLon(vessel.position.longitude)}`);
  }
  return parts.join(' · ');
}

// ── helpers ────────────────────────────────────────────────────────────────

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function normalizeAngleRad(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((((rad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
