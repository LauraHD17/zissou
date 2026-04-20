import { describe, expect, it } from 'vitest';
import { tideHeightFt, tideTrend, nextTideEvent } from './tides';

describe('tideHeightFt', () => {
  it('stays within [0, 10] feet for the M2 stub (amplitude 5)', () => {
    const start = new Date('2026-04-19T00:00:00').getTime();
    for (let h = 0; h < 48; h++) {
      const t = new Date(start + h * 60 * 60 * 1000);
      const ht = tideHeightFt(t);
      expect(ht).toBeGreaterThanOrEqual(0);
      expect(ht).toBeLessThanOrEqual(10);
    }
  });

  it('is near maximum at the reference high tide', () => {
    const refHigh = new Date('2026-04-19T03:00:00');
    expect(tideHeightFt(refHigh)).toBeGreaterThan(9.9);
  });

  it('is near minimum half a cycle after the reference', () => {
    const halfPeriodMs = (12.42 / 2) * 60 * 60 * 1000;
    const low = new Date(new Date('2026-04-19T03:00:00').getTime() + halfPeriodMs);
    expect(tideHeightFt(low)).toBeLessThan(0.1);
  });
});

describe('tideTrend', () => {
  it('is falling after a high tide', () => {
    const justAfterHigh = new Date('2026-04-19T03:15:00');
    expect(tideTrend(justAfterHigh).direction).toBe('falling');
  });

  it('is rising after a low tide', () => {
    const halfPeriodMs = (12.42 / 2) * 60 * 60 * 1000;
    const justAfterLow = new Date(
      new Date('2026-04-19T03:00:00').getTime() + halfPeriodMs + 15 * 60 * 1000,
    );
    expect(tideTrend(justAfterLow).direction).toBe('rising');
  });
});

describe('nextTideEvent', () => {
  it('points to a falling/low after the reference high', () => {
    const e = nextTideEvent(new Date('2026-04-19T04:00:00'));
    expect(e.kind).toBe('low');
    expect(e.direction).toBe('falling');
  });
});
