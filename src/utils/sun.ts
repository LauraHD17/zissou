// Next sun event (sunrise or sunset) at a given position. Uses suncalc, which
// computes from astronomical equations — works fully offline.

import SunCalc from 'suncalc';
import type { Position } from '../signalk/types';

export type SunEventKind = 'sunrise' | 'sunset';

export interface SunEvent {
  kind: SunEventKind;
  time: Date;
}

/**
 * Returns the next sun event after `now` at `pos`. Looks today and tomorrow
 * so we always return something even at edges (e.g. just after sunset).
 */
export function nextSunEvent(now: Date, pos: Position): SunEvent | null {
  if (!pos) return null;

  const today = SunCalc.getTimes(now, pos.latitude, pos.longitude);
  const tomorrow = SunCalc.getTimes(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    pos.latitude,
    pos.longitude,
  );

  // Candidates in chronological order. Some of today's may already be in the
  // past — filter to future events only.
  const candidates: SunEvent[] = (
    [
      { kind: 'sunrise', time: today.sunrise },
      { kind: 'sunset', time: today.sunset },
      { kind: 'sunrise', time: tomorrow.sunrise },
      { kind: 'sunset', time: tomorrow.sunset },
    ] as SunEvent[]
  ).filter((e) => e.time instanceof Date && !isNaN(e.time.getTime()) && e.time > now);

  return candidates[0] ?? null;
}
