// Tide-aware computations that surface warnings to the operator.
// All inputs are in feet. Water depth at a point = chartedDepthFt + tideFt
// (tide is above mean low water). "Unsafe" when water depth < draft + margin.

import { tideHeightFt } from '../utils/tides';
import type { Position } from '../signalk/types';

/** Minimum tide height (ft) over a future window. Samples at 10-min cadence.
 *  Used to compute the worst case for route + anchorage checks. */
export function minTideFtInWindow(now: Date, hoursAhead: number, pos?: Position): number {
  let min = Infinity;
  const samples = Math.max(1, Math.ceil((hoursAhead * 60) / 10));
  for (let i = 0; i <= samples; i++) {
    const t = new Date(now.getTime() + (i * hoursAhead * 60 * 60 * 1000) / samples);
    const h = tideHeightFt(t, pos);
    if (h < min) min = h;
  }
  return min;
}

/** When (if ever) in the next N hours does the tide drop to a given height?
 *  Returns minutes from now, or null if it doesn't. */
export function minsUntilTideReaches(
  now: Date,
  targetFt: number,
  hoursAhead: number,
  pos?: Position,
): number | null {
  const samples = Math.max(1, Math.ceil((hoursAhead * 60) / 5));
  for (let i = 0; i <= samples; i++) {
    const mins = (i * hoursAhead * 60) / samples;
    const t = new Date(now.getTime() + mins * 60 * 1000);
    if (tideHeightFt(t, pos) <= targetFt) return mins;
  }
  return null;
}

/** Safe passage windows over a look-ahead horizon, sampled at stepMins
 *  intervals. A window runs while the minimum water depth along the route
 *  stays above the required clearance. */
export function calculateSafePassageWindows(
  now: Date,
  minChartedFt: number,
  requiredFt: number,
  hoursAhead: number,
  stepMins = 30,
  pos?: import('../signalk/types').Position,
): { start: Date; end: Date }[] {
  const samples = Math.ceil((hoursAhead * 60) / stepMins);
  const windows: { start: Date; end: Date }[] = [];
  let windowStart: Date | null = null;
  let lastSafeTime: Date | null = null;

  for (let i = 0; i <= samples; i++) {
    const t = new Date(now.getTime() + i * stepMins * 60 * 1000);
    const effective = minChartedFt + tideHeightFt(t, pos);
    const safe = effective >= requiredFt;
    if (safe && !windowStart) windowStart = t;
    if (safe) lastSafeTime = t;
    if (!safe && windowStart && lastSafeTime) {
      windows.push({ start: windowStart, end: lastSafeTime });
      windowStart = null;
    }
  }
  if (windowStart && lastSafeTime) windows.push({ start: windowStart, end: lastSafeTime });
  return windows;
}

export interface AnchorageDryingAssessment {
  /** Minutes until draft + safety margin is exceeded by low water. null if
   *  it won't happen in the lookahead window. */
  minsUntilUnsafe: number | null;
  /** Worst-case water depth (ft) over the window. */
  minWaterFt: number;
  /** Required water depth (draft + safety margin). */
  requiredFt: number;
  /** Shorthand — true when minsUntilUnsafe is within 60 min (imminent). */
  imminent: boolean;
}

export function assessAnchorageDrying({
  now,
  chartedDepthFt,
  draftFt,
  safetyMarginFt,
  pos,
  hoursAhead = 6,
}: {
  now: Date;
  chartedDepthFt: number;
  draftFt: number;
  safetyMarginFt: number;
  pos?: Position;
  hoursAhead?: number;
}): AnchorageDryingAssessment {
  const requiredFt = draftFt + safetyMarginFt;
  // water_depth_unsafe = chartedDepth + tide < requiredFt
  //   → tide < requiredFt - chartedDepth
  const tideThreshold = requiredFt - chartedDepthFt;
  const min = minTideFtInWindow(now, hoursAhead, pos);
  const minWaterFt = chartedDepthFt + min;
  const minsUntilUnsafe =
    tideThreshold > 0 ? minsUntilTideReaches(now, tideThreshold, hoursAhead, pos) : null;
  return {
    minsUntilUnsafe,
    minWaterFt,
    requiredFt,
    imminent: minsUntilUnsafe != null && minsUntilUnsafe <= 60,
  };
}
