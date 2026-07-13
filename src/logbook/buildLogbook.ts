// Pure generator: recorded breadcrumbs + dwells + log events → narrative
// ship's-log entries, one per local day. Same plain-language register as the
// AIS narrative; silence over filler (a day with nothing recorded produces
// no entry, and places without a saved waypoint nearby get honest
// coordinates, not invented names).

import type { Breadcrumb } from '../breadcrumbs/breadcrumbStore';
import type { SavedWaypoint } from '../types/nav';
import type { LogEvent } from './logEventStore';
import {
  detectDwells,
  formatDwellDuration,
  tagDwell,
  type Dwell,
} from '../breadcrumbs/dwellDetector';
import { haversineNm } from '../utils/geometry';
import { formatLocalTime } from '../utils/clock';
import { formatDistance, formatLat, formatLon } from '../utils/units';

/** Same geographic-match radius the suggested-waypoints view uses (~92 m) —
 *  a dwell that close to a saved waypoint is named after it. */
const PLACE_MATCH_NM = 0.05;

/** Consecutive-crumb gaps beyond these don't count as distance run (mirrors
 *  the track line's split rule — trailer moves aren't passage miles). */
const GAP_MS = 30 * 60 * 1000;
const GAP_NM = 1;

/** Days with less than this much movement log as a stationary day. */
const MIN_RUN_NM = 0.2;

export interface LogbookDay {
  /** Local-midnight ms — stable key, newest-first sort. */
  dayStart: number;
  /** "Jul 13" */
  title: string;
  /** Narrative lines in chronological order. */
  lines: string[];
  distanceNm: number;
}

export interface LogbookInput {
  crumbs: Breadcrumb[];
  waypoints: SavedWaypoint[];
  events: LogEvent[];
}

export function buildLogbookDays({ crumbs, waypoints, events }: LogbookInput): LogbookDay[] {
  const days = new Map<number, { t: number; text: string }[]>();
  const distances = new Map<number, number>();
  const add = (t: number, text: string) => {
    const key = localMidnight(t);
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push({ t, text });
  };

  // Distance run per day (gap-split like the track line).
  for (let i = 1; i < crumbs.length; i++) {
    const a = crumbs[i - 1];
    const b = crumbs[i];
    if (b.t - a.t > GAP_MS) continue;
    const nm = haversineNm(
      { latitude: a.lat, longitude: a.lon },
      { latitude: b.lat, longitude: b.lon },
    );
    if (nm > GAP_NM) continue;
    const key = localMidnight(b.t);
    distances.set(key, (distances.get(key) ?? 0) + nm);
  }

  // Dwells → stop lines on the day the stop began; a dwell that ends with
  // more track after it that day is also that day's departure point.
  const dwells = detectDwells(crumbs);
  const lastCrumbT = crumbs.length > 0 ? crumbs[crumbs.length - 1].t : 0;
  for (const dwell of dwells) {
    const place = placeName(dwell, waypoints);
    const verb = tagDwell(dwell) === 'mooring' ? 'Moored' : 'Anchored';
    add(
      dwell.startedAt,
      `${verb} ${place} ${formatLocalTime(new Date(dwell.startedAt))} · ${formatDwellDuration(dwell.durationMs)}`,
    );
    if (dwell.endedAt < lastCrumbT) {
      add(dwell.endedAt, `Departed ${place} ${formatLocalTime(new Date(dwell.endedAt))}`);
    }
  }

  // Recorded actions.
  for (const e of events) {
    add(e.t, eventLine(e));
  }

  // Days that moved but produced no dwell/event lines still deserve an entry.
  for (const [key, nm] of distances) {
    if (nm >= MIN_RUN_NM && !days.has(key)) days.set(key, []);
  }

  return [...days.entries()]
    .map(([dayStart, entries]) => {
      const distanceNm = distances.get(dayStart) ?? 0;
      const lines = entries.sort((a, b) => a.t - b.t).map((e) => e.text);
      if (distanceNm >= MIN_RUN_NM) {
        lines.push(`Distance run ${formatDistance(distanceNm)}`);
      }
      return { dayStart, title: dayTitle(dayStart), lines, distanceNm };
    })
    .filter((d) => d.lines.length > 0)
    .sort((a, b) => b.dayStart - a.dayStart);
}

/** One shareable text block per day. */
export function formatLogbookEntry(day: LogbookDay): string {
  return [day.title, ...day.lines].join('\n');
}

function eventLine(e: LogEvent): string {
  const time = formatLocalTime(new Date(e.t));
  switch (e.kind) {
    case 'mob':
      return `MOB marked ${time}`;
    case 'anchor-set':
      return `Anchor watch set ${time}`;
    case 'anchor-clear':
      return `Anchor watch cleared ${time}`;
    case 'waypoint-saved':
      return e.label ? `Saved "${e.label}" ${time}` : `Saved a waypoint ${time}`;
  }
}

/** Nearest saved waypoint within the match radius names the place; otherwise
 *  honest coordinates. */
function placeName(dwell: Dwell, waypoints: SavedWaypoint[]): string {
  let best: SavedWaypoint | null = null;
  let bestNm = PLACE_MATCH_NM;
  for (const w of waypoints) {
    const nm = haversineNm(dwell.center, { latitude: w.lat, longitude: w.lon });
    if (nm <= bestNm && w.label) {
      best = w;
      bestNm = nm;
    }
  }
  if (best) return best.label;
  return `${formatLat(dwell.center.latitude)} ${formatLon(dwell.center.longitude)}`;
}

function localMidnight(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayTitle(dayStart: number): string {
  const d = new Date(dayStart);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
