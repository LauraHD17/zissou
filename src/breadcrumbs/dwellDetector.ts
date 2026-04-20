// Segment breadcrumbs into "dwells" — periods when the boat stayed in a
// small area for longer than DWELL_MIN_MS. Output is a list of suggestions
// that the operator can review in the Waypoints panel and save-if-interesting.
//
// Heuristic, not a spatial database: we group consecutive breadcrumbs whose
// distance from an anchor breadcrumb stays within DWELL_RADIUS_NM. When the
// group spans DWELL_MIN_MS and the spread radius stays small, it's a dwell.

import { haversineNm } from '../utils/geometry';
import type { Breadcrumb } from './breadcrumbStore';

export const DWELL_MIN_MS = 2 * 60 * 60 * 1000; // 2 hours
const DWELL_RADIUS_NM = 0.03; // ~55 m — harbor-slip-sized

export interface Dwell {
  id: string;
  center: { latitude: number; longitude: number };
  startedAt: number;
  endedAt: number;
  durationMs: number;
  pointCount: number;
}

export type DwellTag = 'mooring' | 'anchorage-overnight' | 'anchorage' | 'fuel-stop';

export function detectDwells(points: Breadcrumb[]): Dwell[] {
  const dwells: Dwell[] = [];
  if (points.length < 2) return dwells;

  let i = 0;
  while (i < points.length) {
    const anchor = points[i];
    let j = i;
    while (
      j + 1 < points.length &&
      haversineNm(
        { latitude: anchor.lat, longitude: anchor.lon },
        { latitude: points[j + 1].lat, longitude: points[j + 1].lon },
      ) <= DWELL_RADIUS_NM
    ) {
      j++;
    }
    const span = points[j].t - anchor.t;
    if (span >= DWELL_MIN_MS && j - i >= 2) {
      dwells.push({
        id: `dwell-${anchor.t}`,
        center: centerOf(points.slice(i, j + 1)),
        startedAt: anchor.t,
        endedAt: points[j].t,
        durationMs: span,
        pointCount: j - i + 1,
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return dwells;
}

/** Auto-classify a dwell based on duration + time-of-day. Conservative:
 *  "anchorage-overnight" only when the dwell spans local 02:00–05:00 (deep
 *  night, almost certainly overnight at anchor). Shorter stops during
 *  daylight become "mooring" (marina slip / mooring ball / pause). */
export function tagDwell(d: Dwell): DwellTag {
  const start = new Date(d.startedAt);
  const end = new Date(d.endedAt);
  if (spansDeepNight(start, end)) return 'anchorage-overnight';
  const hours = d.durationMs / (60 * 60 * 1000);
  if (hours >= 6) return 'anchorage';
  return 'mooring';
}

function spansDeepNight(start: Date, end: Date): boolean {
  // Any local hour in [2, 5) within [start, end]?
  const startMs = start.getTime();
  const endMs = end.getTime();
  const cursor = new Date(start);
  cursor.setHours(3, 0, 0, 0); // 03:00 local
  // If 03:00 of the start date is before startMs, jump forward a day.
  if (cursor.getTime() < startMs) cursor.setDate(cursor.getDate() + 1);
  return cursor.getTime() <= endMs;
}

function centerOf(group: Breadcrumb[]): { latitude: number; longitude: number } {
  const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
  const lon = group.reduce((s, p) => s + p.lon, 0) / group.length;
  return { latitude: lat, longitude: lon };
}

export function formatDwellDuration(ms: number): string {
  const h = ms / (60 * 60 * 1000);
  if (h < 3) return `${Math.round(h * 10) / 10} hr`;
  if (h < 24) return `${Math.round(h)} hr`;
  const d = Math.round((h / 24) * 10) / 10;
  return `${d} days`;
}

export function formatDwellDate(t: number): string {
  const d = new Date(t);
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} ${d.getDate()}`;
}
