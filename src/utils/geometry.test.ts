import { describe, expect, it } from 'vitest';
import {
  bearingRadians,
  haversineNm,
  isPlausiblePosition,
  projectPosition,
  samplePolyline,
} from './geometry';

const CASTINE = { latitude: 44.4, longitude: -68.8 };

describe('isPlausiblePosition', () => {
  it('rejects undefined', () => {
    expect(isPlausiblePosition(undefined)).toBe(false);
  });

  it('rejects null island (0,0) — common AIS garbage sentinel', () => {
    expect(isPlausiblePosition({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it('rejects out-of-range latitude', () => {
    expect(isPlausiblePosition({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isPlausiblePosition({ latitude: -91, longitude: 0 })).toBe(false);
  });

  it('rejects out-of-range longitude', () => {
    expect(isPlausiblePosition({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isPlausiblePosition({ latitude: 0, longitude: -181 })).toBe(false);
  });

  it('accepts a real coastal Maine position', () => {
    expect(isPlausiblePosition(CASTINE)).toBe(true);
  });
});

describe('haversineNm', () => {
  it('returns 0 for the same position', () => {
    expect(haversineNm(CASTINE, CASTINE)).toBeCloseTo(0, 5);
  });

  it('matches the canonical "1 minute of latitude = 1 nm"', () => {
    const oneMinuteNorth = { latitude: 44.4 + 1 / 60, longitude: -68.8 };
    expect(haversineNm(CASTINE, oneMinuteNorth)).toBeCloseTo(1, 1);
  });

  it('is symmetric (a→b == b→a)', () => {
    const b = { latitude: 44.5, longitude: -68.7 };
    expect(haversineNm(CASTINE, b)).toBeCloseTo(haversineNm(b, CASTINE), 6);
  });
});

describe('bearingRadians', () => {
  const toDeg = (r: number) => (r * 180) / Math.PI;

  it('returns ~0° (north) for due-north target', () => {
    const north = { latitude: 44.5, longitude: -68.8 };
    expect(toDeg(bearingRadians(CASTINE, north))).toBeCloseTo(0, 0);
  });

  it('returns ~90° (east) for due-east target', () => {
    const east = { latitude: 44.4, longitude: -68.7 };
    expect(toDeg(bearingRadians(CASTINE, east))).toBeCloseTo(90, 0);
  });

  it('returns ~180° (south) for due-south target', () => {
    const south = { latitude: 44.3, longitude: -68.8 };
    expect(toDeg(bearingRadians(CASTINE, south))).toBeCloseTo(180, 0);
  });

  it('returns ~270° (west) for due-west target', () => {
    const west = { latitude: 44.4, longitude: -68.9 };
    expect(toDeg(bearingRadians(CASTINE, west))).toBeCloseTo(270, 0);
  });

  it('always returns a value in [0, 2π)', () => {
    const cases = [
      { latitude: 50, longitude: -68.8 },
      { latitude: 40, longitude: -68.8 },
      { latitude: 44.4, longitude: -50 },
      { latitude: 44.4, longitude: -90 },
    ];
    for (const target of cases) {
      const b = bearingRadians(CASTINE, target);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(Math.PI * 2);
    }
  });
});

describe('projectPosition', () => {
  it('round-trips with bearingRadians + haversineNm', () => {
    const distM = 1852; // 1 nm
    const bearingRad = Math.PI / 4; // NE
    const end = projectPosition(CASTINE, bearingRad, distM);
    expect(haversineNm(CASTINE, end)).toBeCloseTo(1, 2);
    expect(bearingRadians(CASTINE, end)).toBeCloseTo(bearingRad, 2);
  });

  it('moving 0 meters returns essentially the same point', () => {
    const end = projectPosition(CASTINE, 0, 0);
    expect(haversineNm(CASTINE, end)).toBeCloseTo(0, 5);
  });
});

describe('samplePolyline', () => {
  const A = { latitude: 44.0, longitude: -68.0 };
  const B = { latitude: 44.1, longitude: -68.0 };
  const C = { latitude: 44.1, longitude: -68.1 };

  it('returns one point for a single-position input', () => {
    expect(samplePolyline([A], 10)).toEqual([A]);
  });

  it('returns empty for empty input', () => {
    expect(samplePolyline([], 10)).toEqual([]);
  });

  it('returns samples+1 points for a straight segment', () => {
    const out = samplePolyline([A, B], 10);
    expect(out.length).toBe(11);
    expect(out[0]).toEqual(A);
    expect(out[out.length - 1]).toEqual(B);
  });

  it('distributes samples across a multi-leg polyline by length', () => {
    // A→B and B→C are both 0.1° — equal legs.
    const out = samplePolyline([A, B, C], 10);
    expect(out.length).toBe(11);
    expect(out[0]).toEqual(A);
    expect(out[out.length - 1]).toEqual(C);
    // The midpoint of the polyline by arc length falls right at B.
    const mid = out[5];
    expect(mid.latitude).toBeCloseTo(B.latitude, 5);
    expect(mid.longitude).toBeCloseTo(B.longitude, 5);
  });

  it('handles degenerate (total-length-zero) polylines without NaN', () => {
    const out = samplePolyline([A, A, A], 4);
    // One point is acceptable; no NaN anywhere.
    for (const p of out) {
      expect(Number.isFinite(p.latitude)).toBe(true);
      expect(Number.isFinite(p.longitude)).toBe(true);
    }
  });
});
