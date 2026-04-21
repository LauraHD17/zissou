import { describe, expect, it } from 'vitest';
import type { Vessel } from '../signalk/types';
import type { RouteWaypoint } from '../types/nav';
import { computeRouteEta, totalRouteNm } from './routeEta';

function wp(lat: number, lon: number, id: string): RouteWaypoint {
  return { id, position: { latitude: lat, longitude: lon }, setAt: 0 };
}

const CASTINE: Vessel = {
  context: 'vessels.self',
  lastUpdated: Date.now(),
  position: { latitude: 44.4, longitude: -68.8 },
  paths: {},
};

describe('totalRouteNm', () => {
  it('returns 0 for an empty route', () => {
    expect(totalRouteNm([], CASTINE)).toBe(0);
  });

  it('returns 0 when own position is missing', () => {
    expect(totalRouteNm([wp(44.5, -68.8, 'a')], undefined)).toBe(0);
  });

  it('matches the canonical "1 minute of latitude = 1 nm" for a single-pin route', () => {
    const oneMinuteNorth = wp(44.4 + 1 / 60, -68.8, 'a');
    expect(totalRouteNm([oneMinuteNorth], CASTINE)).toBeCloseTo(1, 1);
  });

  it('sums leg distances across a multi-pin route', () => {
    const a = wp(44.4 + 1 / 60, -68.8, 'a'); // 1 nm N of self
    const b = wp(44.4 + 2 / 60, -68.8, 'b'); // 2 nm N of self, 1 nm N of A
    expect(totalRouteNm([a, b], CASTINE)).toBeCloseTo(2, 1);
  });
});

describe('computeRouteEta', () => {
  const oneNmNorth = wp(44.4 + 1 / 60, -68.8, 'a');

  it('returns null minutes when own position is missing', () => {
    const out = computeRouteEta([oneNmNorth], undefined);
    expect(out.minutes).toBeNull();
  });

  it('uses SOG when underway (>= 0.5 kn)', () => {
    // 6 kn = 3.0867 m/s
    const underway: Vessel = { ...CASTINE, sog: 3.0867 };
    const out = computeRouteEta([oneNmNorth], underway);
    expect(out.speedSource).toBe('sog');
    // 1 nm / 6 kn = 10 min
    expect(out.minutes).toBeCloseTo(10, 0);
  });

  it('falls back to cruising speed when not underway', () => {
    const drifting: Vessel = { ...CASTINE, sog: 0 };
    const out = computeRouteEta([oneNmNorth], drifting);
    expect(out.speedSource).toBe('cruising');
    // Default cruising = 6 kn; 1 nm / 6 kn = 10 min
    expect(out.minutes).toBeCloseTo(10, 0);
  });

  it('returns null for an empty route', () => {
    const underway: Vessel = { ...CASTINE, sog: 3.0867 };
    const out = computeRouteEta([], underway);
    expect(out.totalNm).toBe(0);
    expect(out.minutes).toBeNull();
  });
});
