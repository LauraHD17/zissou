// VHF hailing script for a tapped AIS vessel — plain-language extended to
// radio comms. Standard channel-16 hail: callee twice, own vessel name,
// position of self as seen FROM THE TARGET (that's what helps them find you),
// then a spoken-coordinate readback they can plot.
//
// Conservative-data rules apply: any line that would need a missing or
// implausible position is omitted rather than guessed.

import type { Vessel } from '../signalk/types';
import { bearingRadians, haversineNm, isPlausiblePosition } from './geometry';
import { formatAbsoluteBearing } from './bearings';
import { formatDistance, formatLat, formatLon } from './units';

export interface VhfScript {
  /** How to address the other vessel on the radio. */
  calleeName: string;
  /** Script lines in speaking order. */
  lines: string[];
  /** True when the own-boat name is unset and the script uses a placeholder. */
  missingOwnName: boolean;
}

/** Placeholder spoken where the operator's boat name should go when unset. */
export const OWN_NAME_PLACEHOLDER = '[your boat name]';

export function buildVhfScript(
  target: Vessel,
  self: Vessel | undefined,
  ownBoatName: string,
): VhfScript {
  const calleeName = calleeFor(target);
  const missingOwnName = !ownBoatName || ownBoatName === '—';
  const own = missingOwnName ? OWN_NAME_PLACEHOLDER : ownBoatName;

  const lines: string[] = [`${calleeName}, ${calleeName}, this is ${own}, over.`];

  // Where to look for us, from the target's own deck.
  const targetPos = isPlausiblePosition(target.position) ? target.position : undefined;
  const selfPos = self && isPlausiblePosition(self.position) ? self.position : undefined;
  if (targetPos && selfPos) {
    const bearing = bearingRadians(targetPos, selfPos);
    const distance = haversineNm(targetPos, selfPos);
    lines.push(`I am the vessel ${formatDistance(distance)} ${formatAbsoluteBearing(bearing)}.`);
  }

  // Spoken position readback they can plot.
  if (selfPos) {
    lines.push(`My position is ${spokenLatLon(selfPos.latitude, selfPos.longitude)}.`);
  }

  return { calleeName, lines, missingOwnName };
}

/** How to hail a vessel with degraded identity: name → MMSI → position → generic. */
function calleeFor(target: Vessel): string {
  if (target.name) return target.name;
  if (target.mmsi) return `Vessel with MMSI ${spokenDigits(target.mmsi)}`;
  if (isPlausiblePosition(target.position)) {
    return `Vessel near ${formatLat(target.position?.latitude)}, ${formatLon(target.position?.longitude)}`;
  }
  return 'Unknown vessel';
}

/**
 * Degrees-decimal-minutes spoken aloud — the form a listener plots straight
 * onto a chart: "44 degrees 23.7 minutes North, 068 degrees 47.4 minutes West".
 */
export function spokenLatLon(lat: number, lon: number): string {
  return `${spokenAngle(lat, lat >= 0 ? 'North' : 'South', 2)}, ${spokenAngle(lon, lon >= 0 ? 'East' : 'West', 3)}`;
}

function spokenAngle(value: number, hemisphere: string, degDigits: number): string {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = (abs - degrees) * 60;
  // 59.96' rounds to 60.0' — carry into the degree rather than speaking "60 minutes".
  if (Number(minutes.toFixed(1)) >= 60) {
    degrees += 1;
    minutes = 0;
  }
  return `${String(degrees).padStart(degDigits, '0')} degrees ${minutes.toFixed(1)} minutes ${hemisphere}`;
}

/** MMSI read digit-by-digit with spacing, the way it's spoken on the radio. */
function spokenDigits(mmsi: string): string {
  return mmsi.split('').join(' ');
}
