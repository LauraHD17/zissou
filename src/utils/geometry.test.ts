import { describe, expect, it } from 'vitest';
import { bearingRadians, haversineNm, isPlausiblePosition, projectPosition } from './geometry';

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
