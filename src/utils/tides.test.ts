import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __setTidesForTests,
  currentTideStationName,
  nearestStation,
  nextTideEvent,
  tideHeightFt,
  tideTrend,
  type TidePayload,
} from './tides';

// 6-hour cycle: high at t=0 (10 ft), low at t=+6h (0 ft), high at +12h.
function fixture(): TidePayload {
  const t0 = Date.parse('2026-04-19T00:00:00Z');
  const sixHr = 6 * 60 * 60 * 1000;
  const events = [];
  for (let i = 0; i < 8; i++) {
    events.push({
      t: new Date(t0 + i * sixHr).toISOString(),
      kind: i % 2 === 0 ? ('H' as const) : ('L' as const),
      heightFt: i % 2 === 0 ? 10 : 0,
    });
  }
  return {
    fetchedAt: '2026-04-01T00:00:00Z',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-12-31T23:59:59Z',
    stations: [
      { id: 'A', name: 'Castine', lat: 44.39, lon: -68.8, events },
      // A second station 1° west — used to verify nearest-station picking.
      { id: 'B', name: 'Rockland', lat: 44.1, lon: -69.1, events },
    ],
  };
}

describe('with NOAA fixture loaded', () => {
  beforeEach(() => __setTidesForTests(fixture()));
  afterEach(() => __setTidesForTests(null));

  describe('nearestStation', () => {
    it('picks Castine for a position near Castine', () => {
      const s = nearestStation({ latitude: 44.4, longitude: -68.79 });
      expect(s?.name).toBe('Castine');
    });

    it('picks Rockland for a position near Rockland', () => {
      const s = nearestStation({ latitude: 44.11, longitude: -69.0 });
      expect(s?.name).toBe('Rockland');
    });

    it('falls back to mid-bay (Castine) when position is undefined', () => {
      const s = nearestStation(undefined);
      expect(s?.name).toBe('Castine');
    });
  });

  describe('tideHeightFt cosine interpolation', () => {
    const t0 = Date.parse('2026-04-19T00:00:00Z'); // high (10 ft)
    const sixHr = 6 * 60 * 60 * 1000;
    const pos = { latitude: 44.39, longitude: -68.8 };

    it('peaks at 10 ft at the high event', () => {
      expect(tideHeightFt(new Date(t0), pos)).toBeCloseTo(10, 5);
    });

    it('troughs at 0 ft at the low event', () => {
      expect(tideHeightFt(new Date(t0 + sixHr - 1), pos)).toBeCloseTo(0, 1);
    });

    it('is exactly halfway (5 ft) at the midpoint between high and low', () => {
      expect(tideHeightFt(new Date(t0 + sixHr / 2), pos)).toBeCloseTo(5, 5);
    });

    it('is monotonically falling from high to low', () => {
      let prev = tideHeightFt(new Date(t0), pos);
      for (let m = 30; m < 360; m += 30) {
        const h = tideHeightFt(new Date(t0 + m * 60 * 1000), pos);
        expect(h).toBeLessThanOrEqual(prev + 1e-9);
        prev = h;
      }
    });
  });

  describe('nextTideEvent', () => {
    const pos = { latitude: 44.39, longitude: -68.8 };
    const t0 = Date.parse('2026-04-19T00:00:00Z');

    it('returns the upcoming low after a high', () => {
      const e = nextTideEvent(new Date(t0 + 60 * 1000), pos);
      expect(e.kind).toBe('low');
      expect(e.direction).toBe('falling');
      expect(e.isEstimate).toBe(false);
    });

    it('returns the upcoming high after a low', () => {
      const e = nextTideEvent(new Date(t0 + 6 * 60 * 60 * 1000 + 60 * 1000), pos);
      expect(e.kind).toBe('high');
      expect(e.direction).toBe('rising');
    });
  });

  describe('tideTrend', () => {
    const pos = { latitude: 44.39, longitude: -68.8 };
    const t0 = Date.parse('2026-04-19T00:00:00Z');

    it('falls just after a high', () => {
      expect(tideTrend(new Date(t0 + 30 * 60 * 1000), pos).direction).toBe('falling');
    });

    it('rises just after a low', () => {
      expect(tideTrend(new Date(t0 + 6 * 60 * 60 * 1000 + 30 * 60 * 1000), pos).direction).toBe(
        'rising',
      );
    });
  });

  it('exposes the station name for the UI label', () => {
    expect(currentTideStationName({ latitude: 44.39, longitude: -68.8 })).toBe('Castine');
    expect(currentTideStationName({ latitude: 44.11, longitude: -69.0 })).toBe('Rockland');
  });
});

describe('without NOAA data (M2 stub fallback)', () => {
  beforeEach(() => __setTidesForTests(null));

  it('tideHeightFt stays within [0, 10] ft and crosses the band', () => {
    const start = Date.parse('2026-04-19T00:00:00Z');
    let sawLow = false;
    let sawHigh = false;
    for (let h = 0; h < 48; h++) {
      const v = tideHeightFt(new Date(start + h * 60 * 60 * 1000));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
      if (v < 0.5) sawLow = true;
      if (v > 9.5) sawHigh = true;
    }
    expect(sawLow).toBe(true);
    expect(sawHigh).toBe(true);
  });

  it('nextTideEvent flags isEstimate=true', () => {
    const e = nextTideEvent(new Date('2026-04-19T04:00:00Z'));
    expect(e.isEstimate).toBe(true);
  });

  it('currentTideStationName returns null', () => {
    expect(currentTideStationName({ latitude: 44.39, longitude: -68.8 })).toBeNull();
  });
});
