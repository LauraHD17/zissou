import { afterEach, describe, expect, it } from 'vitest';
import { __setTidesForTests, type TidePayload } from '../utils/tides';
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

describe('assessAnchorageDrying — below-MLLW (negative) lows', () => {
  afterEach(() => __setTidesForTests(null));

  // NOAA heights are relative to MLLW and real Maine lows go below it
  // (−0.93 ft on 2026-01-01 in the bundled data). Regression: the alarm
  // countdown must run even when required depth ≤ charted depth, because a
  // negative low can still take the water below the keel clearance.
  function negativeLowFixture(): TidePayload {
    const t0 = Date.parse('2026-04-19T00:00:00Z');
    const sixHr = 6 * 60 * 60 * 1000;
    const events = [];
    for (let i = 0; i < 8; i++) {
      events.push({
        t: new Date(t0 + i * sixHr).toISOString(),
        kind: i % 2 === 0 ? ('H' as const) : ('L' as const),
        heightFt: i % 2 === 0 ? 10 : -1, // spring low: 1 ft BELOW datum
      });
    }
    return {
      fetchedAt: '2026-04-01T00:00:00Z',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: '2027-12-31T23:59:59Z',
      stations: [{ id: 'A', name: 'Castine', lat: 44.39, lon: -68.8, events }],
    };
  }

  it('counts down to unsafe when required equals charted (threshold = 0) and the low is negative', () => {
    __setTidesForTests(negativeLowFixture());
    const now = new Date('2026-04-19T01:00:00Z'); // falling toward the −1 ft low at 06:00Z
    // 5 ft charted, 3 ft draft, 2 ft margin → required 5 ft. At the −1 ft low
    // the water is 4 ft — below the keel clearance despite threshold = 0.
    const a = assessAnchorageDrying({
      now,
      chartedDepthFt: 5,
      draftFt: 3,
      safetyMarginFt: 2,
      pos: { latitude: 44.39, longitude: -68.8 },
      hoursAhead: 6,
    });
    expect(a.minWaterFt).toBeLessThan(a.requiredFt);
    expect(a.minsUntilUnsafe).not.toBeNull();
  });

  it('counts down when charted even exceeds required (threshold < 0) but the low dips further', () => {
    __setTidesForTests(negativeLowFixture());
    const now = new Date('2026-04-19T01:00:00Z');
    // 5.5 ft charted, required 5 ft → threshold −0.5 ft, still reachable on a
    // −1 ft low: water bottoms at 4.5 ft.
    const a = assessAnchorageDrying({
      now,
      chartedDepthFt: 5.5,
      draftFt: 3,
      safetyMarginFt: 2,
      pos: { latitude: 44.39, longitude: -68.8 },
      hoursAhead: 6,
    });
    expect(a.minWaterFt).toBeLessThan(a.requiredFt);
    expect(a.minsUntilUnsafe).not.toBeNull();
  });

  it('stays quiet when even the negative low leaves enough water', () => {
    __setTidesForTests(negativeLowFixture());
    const now = new Date('2026-04-19T01:00:00Z');
    // 8 ft charted → water bottoms at 7 ft, required 5 ft: never unsafe.
    const a = assessAnchorageDrying({
      now,
      chartedDepthFt: 8,
      draftFt: 3,
      safetyMarginFt: 2,
      pos: { latitude: 44.39, longitude: -68.8 },
      hoursAhead: 6,
    });
    expect(a.minWaterFt).toBeGreaterThan(a.requiredFt);
    expect(a.minsUntilUnsafe).toBeNull();
  });
});
