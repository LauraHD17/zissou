// Tide prediction — station selection + interpolation query layer.
//
// Real predictions come as discrete high/low events at NOAA's published times
// (loaded + cached by tideData.ts). tideHeightFt cosine-interpolates between
// bracketing events — flat at the turns, steepest at the midpoint — which
// matches how harmonic tide behaves locally between stationary points. When no
// NOAA data is loaded, or `now` is outside the loaded window, every reader
// falls back to the M2 stub (tideStub.ts) and flips isEstimate=true so the UI
// can mark the tide pill as approximate.

import type { Position } from '../signalk/types';
import { readLoadedTides, type PreparedStation, type TideEvent } from './tideData';
import { stubHeightFt, stubNextEvent } from './tideStub';

// Re-export the data-layer surface so consumers keep importing from './tides'.
export { loadTides, readLoadedTides, writeTidesToIdb, __setTidesForTests } from './tideData';
export type {
  TideKind,
  TideEvent,
  TidePayload,
  PreparedStation,
  PreparedPayload,
} from './tideData';

const FALLBACK_STATION = { lat: 44.3867, lon: -68.7967 }; // Castine, mid-bay

function distSq(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dx = a.lat - b.lat;
  // A degree of longitude shrinks with latitude (~0.72× at 44°N); without
  // this correction east-west distances are overweighted and the wrong
  // station can win by tens of nm.
  const dy = (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180);
  return dx * dx + dy * dy;
}

export function nearestStation(pos: Position | undefined): PreparedStation | null {
  const data = readLoadedTides();
  if (!data || data.stations.length === 0) return null;
  const target = pos ? { lat: pos.latitude, lon: pos.longitude } : FALLBACK_STATION;
  let best = data.stations[0];
  let bestD = distSq(target, best);
  for (let i = 1; i < data.stations.length; i++) {
    const d = distSq(target, data.stations[i]);
    if (d < bestD) {
      bestD = d;
      best = data.stations[i];
    }
  }
  return best;
}

/** Bracketing event indices for `nowMs`: returns [i0, i1] such that
 *  ts[i0] <= nowMs < ts[i1], or null if `nowMs` is outside the data range. */
function bracket(station: PreparedStation, nowMs: number): [number, number] | null {
  const ts = station.ts;
  if (ts.length < 2) return null;
  if (nowMs < ts[0] || nowMs >= ts[ts.length - 1]) return null;
  // Binary search for the first index with ts[i] > nowMs.
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ts[mid] <= nowMs) lo = mid + 1;
    else hi = mid;
  }
  return [lo - 1, lo];
}

// --- Public API -------------------------------------------------------

export function nextTideEvent(now: Date, pos?: Position): TideEvent {
  const station = nearestStation(pos);
  const data = readLoadedTides();
  if (!station || !data) return stubNextEvent(now);

  const nowMs = now.getTime();
  // Find first event strictly after now.
  const ts = station.ts;
  let i = -1;
  for (let k = 0; k < ts.length; k++) {
    if (ts[k] > nowMs) {
      i = k;
      break;
    }
  }
  if (i < 0) return stubNextEvent(now); // past end of dataset

  const isEstimate = nowMs < data.validFromMs || nowMs > data.validToMs;
  return {
    kind: station.kinds[i] === 'H' ? 'high' : 'low',
    time: new Date(ts[i]),
    direction: station.kinds[i] === 'H' ? 'rising' : 'falling',
    isEstimate,
  };
}

export interface TideHeightReading {
  /** Height relative to MLLW, feet. */
  heightFt: number;
  /** True when the number came from the M2 stub or `now` is outside the
   *  loaded prediction window. Estimated heights can be off by several feet —
   *  grounding-relevant consumers must downgrade or suppress, never present
   *  an estimate as an authoritative depth. */
  isEstimate: boolean;
}

/** Tide height with source quality. Cosine-interpolates between the
 *  bracketing NOAA hi/lo events; falls back to the M2 stub (flagged) when
 *  data is unavailable or `now` lies outside the loaded window. */
export function tideHeightNow(now: Date, pos?: Position): TideHeightReading {
  const station = nearestStation(pos);
  const data = readLoadedTides();
  if (!station || !data) return { heightFt: stubHeightFt(now), isEstimate: true };
  const nowMs = now.getTime();
  const br = bracket(station, nowMs);
  if (!br) return { heightFt: stubHeightFt(now), isEstimate: true };
  const [i0, i1] = br;
  const t0 = station.ts[i0];
  const t1 = station.ts[i1];
  const h0 = station.hs[i0];
  const h1 = station.hs[i1];
  const tau = (nowMs - t0) / (t1 - t0);
  return {
    heightFt: h0 + ((h1 - h0) * (1 - Math.cos(Math.PI * tau))) / 2,
    isEstimate: nowMs < data.validFromMs || nowMs > data.validToMs,
  };
}

/** Bare-number convenience over tideHeightNow. Prefer tideHeightNow anywhere
 *  the answer feeds depth/grounding decisions — this drops the quality flag. */
export function tideHeightFt(now: Date, pos?: Position): number {
  return tideHeightNow(now, pos).heightFt;
}

/** Direction + rate of change. Direction uses a short ±5 min central
 *  difference — a forward 1-hour difference flips sign up to ~30 min before
 *  each turn. Rate is still the coarse next-hour average. Not currently
 *  consumed by the UI (the pill uses nextTideEvent.direction); kept for
 *  future instrument use. */
export function tideTrend(
  now: Date,
  pos?: Position,
): { direction: 'rising' | 'falling'; rateFtPerHr: number } {
  const EPS_MS = 5 * 60 * 1000;
  const before = tideHeightFt(new Date(now.getTime() - EPS_MS), pos);
  const after = tideHeightFt(new Date(now.getTime() + EPS_MS), pos);
  const curr = tideHeightFt(now, pos);
  const later = tideHeightFt(new Date(now.getTime() + 60 * 60 * 1000), pos);
  return { direction: after >= before ? 'rising' : 'falling', rateFtPerHr: Math.abs(later - curr) };
}

/** True when NOAA predictions authoritatively cover the whole [from, to]
 *  span at this position. Events are continuous, so checking both endpoints
 *  suffices. Window-scanning safety checks (drying alarm, passage windows)
 *  should bail to a "tide unknown" state when this is false rather than
 *  alarm — or stay quiet — on stub numbers. */
export function tidesAuthoritative(from: Date, to: Date, pos?: Position): boolean {
  return !tideHeightNow(from, pos).isEstimate && !tideHeightNow(to, pos).isEstimate;
}

/** UI helper: which station is the app currently using for `pos`? Returns
 *  null when only the stub is available so the caller can hide the label. */
export function currentTideStationName(pos?: Position): string | null {
  const station = nearestStation(pos);
  return station ? station.name : null;
}
