// Tide prediction.
//
// CURRENT IMPLEMENTATION: a stub semi-diurnal cycle (M2 tidal constituent only,
// 12.42-hour period). Produces a plausible-looking high/low schedule for dev
// but is NOT a real tide forecast — phase is anchored to an arbitrary reference
// time and ignores all secondary harmonics, location-specific timing, and
// amplitude.
//
// REAL IMPLEMENTATION (deferred): NOAA harmonic constants for the operator's
// cruising area (Penobscot Bay, Maine). Two paths:
//   1. NOAA Tides & Currents API (https://api.tidesandcurrents.noaa.gov) —
//      pre-fetch predictions for next N days, cache locally, refresh when
//      online (e.g., at the dock with wifi).
//   2. Compute from harmonic constants directly using a library like `tidey`
//      or `harmonic-tide`. Constants for Penobscot Bay stations (Bar Harbor,
//      Castine, Bangor) are downloadable from NOAA.
//
// When swapping in a real implementation, only `nextTideEvent` needs to change
// — the UI consumes only `TideEvent`.

import type { Position } from '../signalk/types';

export type TideKind = 'high' | 'low';

export interface TideEvent {
  kind: TideKind;
  time: Date;
  /** Whether the water is currently rising (toward high) or falling (toward low). */
  direction: 'rising' | 'falling';
  /** True while the tide source is the M2 stub. Flip to false once NOAA harmonic
   *  data is wired in. The UI dims and prefixes the event with `~` when set. */
  isEstimate: boolean;
}

const M2_PERIOD_MS = 12.42 * 60 * 60 * 1000;
const HALF_PERIOD_MS = M2_PERIOD_MS / 2;

// Arbitrary reference high tide. Real implementation will derive from station data.
const REF_HIGH = new Date('2026-04-19T03:00:00').getTime();

// M2 amplitude in feet — rough mid-coast-Maine average. Real implementation
// reads the station-specific amplitude.
const M2_AMPLITUDE_FT = 5;

export function nextTideEvent(now: Date, _pos?: Position): TideEvent {
  const elapsed = now.getTime() - REF_HIGH;
  const cycles = elapsed / M2_PERIOD_MS;
  const cycleFloor = Math.floor(cycles);
  const phase = cycles - cycleFloor; // 0 = high, 0.5 = low, 1 = next high

  if (phase < 0.5) {
    // Past high, water is falling, next event is low.
    const lowTime = REF_HIGH + cycleFloor * M2_PERIOD_MS + HALF_PERIOD_MS;
    return { kind: 'low', time: new Date(lowTime), direction: 'falling', isEstimate: true };
  }
  // Past low, water is rising, next event is high.
  const highTime = REF_HIGH + (cycleFloor + 1) * M2_PERIOD_MS;
  return { kind: 'high', time: new Date(highTime), direction: 'rising', isEstimate: true };
}

/** Tide height relative to mean low water, in feet. 0 = lowest, +10 = highest
 *  (for our default 5 ft amplitude). Consumers use the *delta* from charted
 *  depth — contours show soundings at mean low water, so adding this height
 *  gives instantaneous water depth at that point. */
export function tideHeightFt(now: Date, _pos?: Position): number {
  const elapsed = now.getTime() - REF_HIGH;
  const phase = (elapsed / M2_PERIOD_MS) * 2 * Math.PI;
  // cos peaks at REF_HIGH — shift so minimum is 0 (above MLW reference).
  return M2_AMPLITUDE_FT * (1 + Math.cos(phase));
}

/** Direction + rate of change over the next hour. Used by the tide info pill
 *  and the anchorage-drying check. */
export function tideTrend(
  now: Date,
  pos?: Position,
): { direction: 'rising' | 'falling'; rateFtPerHr: number } {
  const curr = tideHeightFt(now, pos);
  const later = tideHeightFt(new Date(now.getTime() + 60 * 60 * 1000), pos);
  const delta = later - curr;
  return { direction: delta >= 0 ? 'rising' : 'falling', rateFtPerHr: Math.abs(delta) };
}
