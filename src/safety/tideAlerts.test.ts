import { describe, expect, it } from 'vitest';
import { assessAnchorageDrying, minTideFtInWindow, minsUntilTideReaches } from './tideAlerts';

describe('minTideFtInWindow', () => {
  it('finds a low near zero within a 12-hour window (stub covers a full cycle)', () => {
    const now = new Date('2026-04-19T03:00:00'); // reference high
    const min = minTideFtInWindow(now, 12);
    expect(min).toBeLessThan(0.5);
  });
});

describe('minsUntilTideReaches', () => {
  it('returns 0 when the target is already satisfied', () => {
    const now = new Date('2026-04-19T03:00:00'); // high tide ~10 ft
    expect(minsUntilTideReaches(now, 15, 6)).toBe(0);
  });

  it('returns null when tide never drops that low in the window', () => {
    const now = new Date('2026-04-19T03:00:00');
    expect(minsUntilTideReaches(now, -1, 6)).toBeNull();
  });
});

describe('assessAnchorageDrying', () => {
  it('flags drying when charted depth is shallow and draft is high', () => {
    const now = new Date('2026-04-19T02:30:00');
    // 4 ft charted, 3 ft draft, 2 ft safety margin → need 5 ft water total.
    // Tide threshold to trigger = 5 − 4 = 1 ft. M2 stub definitely hits < 1 ft
    // within half a cycle from reference high (~6.2 h).
    const a = assessAnchorageDrying({
      now,
      chartedDepthFt: 4,
      draftFt: 3,
      safetyMarginFt: 2,
      hoursAhead: 8,
    });
    expect(a.minsUntilUnsafe).not.toBeNull();
    expect(a.minWaterFt).toBeLessThan(a.requiredFt);
  });

  it('does not flag when charted depth is deep enough even at low tide', () => {
    const now = new Date('2026-04-19T03:00:00');
    const a = assessAnchorageDrying({
      now,
      chartedDepthFt: 30,
      draftFt: 3,
      safetyMarginFt: 2,
      hoursAhead: 8,
    });
    expect(a.minsUntilUnsafe).toBeNull();
    expect(a.minWaterFt).toBeGreaterThan(a.requiredFt);
  });
});
