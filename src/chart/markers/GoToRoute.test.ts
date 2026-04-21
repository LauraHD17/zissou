import { describe, expect, it } from 'vitest';
import type { RouteWaypoint } from '../../types/nav';
import { buildFeature } from './GoToRoute';

function wp(lat: number, lon: number, id: string): RouteWaypoint {
  return { id, position: { latitude: lat, longitude: lon }, setAt: 0 };
}

const OWN = { latitude: 44.0, longitude: -68.0 };

describe('buildFeature', () => {
  it('returns empty when own position is missing', () => {
    const fc = buildFeature(undefined, [wp(44.1, -68.0, 'a')]);
    expect(fc.features.length).toBe(0);
  });

  it('returns empty when the route has no waypoints', () => {
    const fc = buildFeature(OWN, []);
    expect(fc.features.length).toBe(0);
  });

  it('produces a 2-point line for a single-pin route (own-ship → destination)', () => {
    const fc = buildFeature(OWN, [wp(44.1, -68.0, 'a')]);
    expect(fc.features.length).toBe(1);
    expect(fc.features[0].geometry.coordinates).toEqual([
      [-68.0, 44.0],
      [-68.0, 44.1],
    ]);
  });

  it('produces an (N+1)-point polyline for an N-waypoint route', () => {
    const fc = buildFeature(OWN, [
      wp(44.1, -68.0, 'a'),
      wp(44.1, -68.1, 'b'),
      wp(44.2, -68.1, 'c'),
    ]);
    expect(fc.features.length).toBe(1);
    expect(fc.features[0].geometry.coordinates).toEqual([
      [-68.0, 44.0],
      [-68.0, 44.1],
      [-68.1, 44.1],
      [-68.1, 44.2],
    ]);
  });

  it('returns empty on a null-island own position', () => {
    const fc = buildFeature({ latitude: 0, longitude: 0 }, [wp(44.1, -68.0, 'a')]);
    expect(fc.features.length).toBe(0);
  });
});
