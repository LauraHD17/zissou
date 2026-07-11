// SignalK delta message shape as streamed over WebSocket.
// See: https://signalk.org/specification/1.7.0/doc/data_model.html

export interface SignalKDelta {
  context: string;
  updates: SignalKUpdate[];
}

export interface SignalKUpdate {
  timestamp?: string;
  source?: { label?: string; type?: string };
  values: SignalKValue[];
}

export interface SignalKValue {
  path: string;
  value: unknown;
}

export interface Position {
  latitude: number;
  longitude: number;
}

// Derived per-vessel record the UI actually renders.
export interface Vessel {
  context: string;
  mmsi?: string;
  name?: string;
  position?: Position;
  sog?: number;
  cog?: number;
  navState?: string;
  lastUpdated: number;
  paths: Record<string, unknown>;
}

/** A SignalK report older than this is considered stale (no longer trustworthy). */
export const AIS_STALE_MS = 5 * 60 * 1000;

/** True when a vessel's last report is older than AIS_STALE_MS at `nowMs`.
 *  Co-located with the threshold so the staleness rule lives in one place. */
export function isVesselStale(vessel: Pick<Vessel, 'lastUpdated'>, nowMs: number): boolean {
  return nowMs - vessel.lastUpdated > AIS_STALE_MS;
}

/** True when the value is a valid course-over-ground (radians, 0 ≤ cog ≤ 2π). */
export function isValidCogRad(cog: number | null | undefined): cog is number {
  return cog != null && cog >= 0 && cog <= Math.PI * 2;
}

/** True when the value is a plausible speed-over-ground (m/s, 0 ≤ sog < 60). */
export function isValidSogMs(sog: number | null | undefined): sog is number {
  return sog != null && sog >= 0 && sog < 60;
}
