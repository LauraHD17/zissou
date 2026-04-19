import { AIS_STALE_MS, isValidCogRad, isValidSogMs } from '../signalk/types';
import type { Position, Vessel } from '../signalk/types';
import { bearingRadians, haversineNm, isPlausiblePosition } from './geometry';
import { formatAbsoluteBearing, formatCompassBearing, formatRelativeBearing } from './bearings';
import { formatDistance, formatLat, formatLon, formatSpeedKnMph, msToKnots } from './units';

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
  const isStale = now - vessel.lastUpdated > AIS_STALE_MS;
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
    const direction = isValidCogRad(self?.cog)
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
  if (vessel.sog == null) return 'speed unknown';
  // Bare sog check — 999 m/s sentinels and similar garbage shouldn't masquerade.
  if (!isValidSogMs(vessel.sog)) return 'speed reported as implausible';
  if (msToKnots(vessel.sog) < 0.5) return 'stopped in the water';

  const relation =
    isValidCogRad(vessel.cog) && selfPos && vessel.position
      ? classifyCourseRelation(selfPos, vessel.position, vessel.cog)
      : 'moving';
  return `${relation} at ${formatSpeedKnMph(vessel.sog)}`;
}

function classifyCourseRelation(
  selfPos: Position,
  targetPos: Position,
  targetCogRad: number,
): string {
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
  if (isValidSogMs(vessel.sog)) parts.push(`SOG ${msToKnots(vessel.sog).toFixed(1)} kn`);
  if (isValidCogRad(vessel.cog)) parts.push(`COG ${formatCompassBearing(vessel.cog)}`);
  if (vessel.position) {
    parts.push(`${formatLat(vessel.position.latitude)} ${formatLon(vessel.position.longitude)}`);
  }
  return parts.join(' · ');
}

function normalizeAngleRad(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((((rad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
