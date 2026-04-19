import { useEffect, useState } from 'react';

/**
 * `now` that ticks at a chosen interval. Returns a Date so callers can compute
 * derived values (next sun event, time-until-X) without recomputing per consumer.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "2:32 PM" — 12-hour, no leading zero on hour, lowercase or uppercase AM/PM. */
export function formatLocalTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** "7:47 PM" — same format as local time, used for sun/tide event timestamps. */
export const formatEventTime = formatLocalTime;
