// Pure delta-field parsing for the ingest store: SignalK path → derived
// Vessel field, plus the unit-misconfiguration detector. No store state here —
// useSignalK.ts owns the vessel Map/lifecycle; this module owns "what does
// this path/value mean and is it sane."

import type { Position, Vessel } from './types';

const MAX_NAME_CHARS = 40; // real AIS names cap at 20; anything longer is garbage

/** Map one SignalK path/value onto the derived Vessel fields the UI reads.
 *  Mutates `v` — callers pass the fresh copy-on-write vessel being built. */
export function applyDerivedField(v: Vessel, path: string, value: unknown): void {
  switch (path) {
    case 'name':
      if (typeof value === 'string') v.name = value.slice(0, MAX_NAME_CHARS);
      break;
    case 'mmsi':
      if (typeof value === 'string' || typeof value === 'number') v.mmsi = String(value);
      break;
    case 'navigation.position':
      if (isPosition(value)) v.position = value;
      break;
    case 'navigation.speedOverGround':
      if (typeof value === 'number') v.sog = value;
      break;
    case 'navigation.courseOverGroundTrue':
      if (typeof value === 'number') {
        v.cog = value;
        warnIfCogLooksLikeDegrees(value);
      }
      break;
    case 'navigation.state':
      if (typeof value === 'string') v.navState = value;
      break;
  }
}

// SignalK v1 specifies radians for COG, but some plugins emit degrees. There
// is no safe automatic conversion (0–6.28 is valid in both units), so out-of-
// range values are simply rejected by isValidCogRad at the consumers — which
// silently degrades every bearing/threat feature. Surface the misconfiguration
// instead of hiding it.
let degreesLikeCogCount = 0;
let warnedDegreesCog = false;
function warnIfCogLooksLikeDegrees(cog: number) {
  if (cog > Math.PI * 2 && cog <= 360) {
    degreesLikeCogCount++;
    if (degreesLikeCogCount >= 10 && !warnedDegreesCog) {
      warnedDegreesCog = true;
      console.warn(
        'SignalK COG repeatedly exceeds 2π — a source is probably emitting DEGREES ' +
          '(spec says radians). Headings and threat banding are degraded until the ' +
          'source is fixed. Check the SignalK server connection settings.',
      );
    }
  }
}

export function isPosition(v: unknown): v is Position {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Position).latitude === 'number' &&
    typeof (v as Position).longitude === 'number'
  );
}

export function extractMMSI(context: string): string | undefined {
  // Format: vessels.urn:mrn:imo:mmsi:367123456
  const match = context.match(/mmsi:(\d+)/);
  return match?.[1];
}
