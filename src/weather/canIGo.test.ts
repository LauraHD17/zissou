import { describe, expect, it } from 'vitest';
import { assessWindow } from './canIGo';
import type { HourlyForecastEntry } from './weatherStore';

function entry(hoursFromNow: number, windKn: number, windDeg = 45): HourlyForecastEntry {
  return {
    t: Date.now() + hoursFromNow * 60 * 60 * 1000,
    windKn,
    windDeg,
    shortDescription: 'Mostly Sunny',
    tempF: 70,
  };
}

describe('assessWindow', () => {
  const now = Date.now();
  const end = now + 6 * 60 * 60 * 1000;

  it('returns unknown when there is no data in the window', () => {
    expect(assessWindow([], now, end, 15).verdict).toBe('unknown');
  });

  it('returns safe when all winds are well under the limit', () => {
    const hs = [entry(1, 8), entry(3, 10), entry(5, 9)];
    const a = assessWindow(hs, now, end, 15);
    expect(a.verdict).toBe('safe');
    expect(a.maxWindKn).toBe(10);
  });

  it('returns watch when wind is 0–25% over limit', () => {
    const hs = [entry(1, 15), entry(3, 17)]; // limit 15, 17 → 13% over
    const a = assessWindow(hs, now, end, 15);
    expect(a.verdict).toBe('watch');
  });

  it('returns nogo when wind is > 25% over limit', () => {
    const hs = [entry(1, 25)]; // limit 15, 25 → 67% over
    const a = assessWindow(hs, now, end, 15);
    expect(a.verdict).toBe('nogo');
  });

  it('returns unknown when no wind limit is set even if data exists', () => {
    const hs = [entry(1, 12)];
    const a = assessWindow(hs, now, end, undefined);
    expect(a.verdict).toBe('unknown');
    expect(a.maxWindKn).toBe(12);
  });
});
