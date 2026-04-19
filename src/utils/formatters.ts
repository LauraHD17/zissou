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
  const octant = compassOctant(radians);
  const phrase: Record<string, string> = {
    N: 'to your north',
    NE: 'to your northeast',
    E: 'to your east',
    SE: 'to your southeast',
    S: 'to your south',
    SW: 'to your southwest',
    W: 'to your west',
    NW: 'to your northwest',
  };
  return phrase[octant];
}

/** 8-point compass octant (N, NE, E, SE, S, SW, W, NW) from radians. */
export function compassOctant(radians: number): string {
  const twoPi = Math.PI * 2;
  const r = ((radians % twoPi) + twoPi) % twoPi;
  const deg = (r * 180) / Math.PI;
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
  const twoPi = Math.PI * 2;
  const r = ((radians % twoPi) + twoPi) % twoPi;
  const deg = Math.round((r * 180) / Math.PI) % 360;
  return `${String(deg).padStart(3, '0')}° ${compassOctant(radians)}`;
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

/**
 * Project a position by `distanceM` meters along `bearingRad` from start.
 * Uses spherical-earth approximation — accurate enough for short ranges
 * (predictive heading vectors, dead-reckoning over a few minutes).
 */
export function projectPosition(
  start: Position,
  bearingRad: number,
  distanceM: number,
): Position {
  const R = 6_371_000; // earth radius, meters
  const delta = distanceM / R;
  const phi1 = (start.latitude * Math.PI) / 180;
  const lambda1 = (start.longitude * Math.PI) / 180;

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

// ── Threat banding (coarse collision-avoidance heuristic) ─────────────────

export type ThreatBand = 'monitor' | 'caution' | 'danger';

/**
 * Coarse threat classification for an AIS target. Uses distance + closing
 * speed (NOT full CPA/TCPA geometry — that's deferred). Conservative: errs
 * toward "monitor" when data is missing so we don't fatigue the operator
 * with false alarms.
 *
 *   danger  — within 200m, OR within 0.5 nm and closing in <3 min
 *   caution — within 1 nm and closing in <8 min, OR within 2 nm closing in <15 min,
 *             OR within 500m without movement data
 *   monitor — everything else (default; no styling needed)
 *
 * Stale, positionless, and invalid-position targets always return 'monitor'
 * — bad data shouldn't drive collision warnings.
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
  const distMeters = distNm * 1852;

  // Universal proximity floor — anything this close is concerning regardless of motion.
  if (distMeters < 200) return 'danger';

  const haveOwnMotion = self.sog != null && self.cog != null && self.cog <= Math.PI * 2;
  const haveTargetMotion =
    vessel.sog != null && vessel.cog != null && vessel.cog <= Math.PI * 2;

  // Without motion on either side we can't compute closing speed — fall back to range.
  if (!haveOwnMotion || !haveTargetMotion) {
    return distMeters < 500 ? 'caution' : 'monitor';
  }

  const closingMs = closingSpeedMs(
    self.position,
    self.sog!,
    self.cog!,
    vessel.position,
    vessel.sog!,
    vessel.cog!,
  );

  // Opening or stationary relative speed → no threat.
  if (closingMs <= 0.1) return 'monitor';

  const tcpaMin = (distMeters / closingMs) / 60;

  if (distNm < 0.5 && tcpaMin < 3) return 'danger';
  if (distNm < 1 && tcpaMin < 8) return 'caution';
  if (distNm < 2 && tcpaMin < 15) return 'caution';

  return 'monitor';
}

/**
 * Closing speed (m/s) between A and B — positive = gap shrinking,
 * negative = gap opening. Computed as the projection of the relative
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
  // Velocity components (east, north) in m/s. cog is radians from north, clockwise.
  const vAe = sogA * Math.sin(cogA);
  const vAn = sogA * Math.cos(cogA);
  const vBe = sogB * Math.sin(cogB);
  const vBn = sogB * Math.cos(cogB);

  const bearing = bearingRadians(posA, posB);
  const sepE = Math.sin(bearing);
  const sepN = Math.cos(bearing);

  // (vA - vB) projected onto separation direction = rate at which A approaches B.
  return (vAe - vBe) * sepE + (vAn - vBn) * sepN;
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
    parts.push(`COG ${formatCompassBearing(vessel.cog)}`);
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
