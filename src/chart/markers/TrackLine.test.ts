import { describe, expect, it } from 'vitest';
import type { Breadcrumb } from '../../breadcrumbs/breadcrumbStore';
import { buildTrackFeature } from './TrackLine';

const T0 = 1_750_000_000_000;
const MIN = 60_000;
const M_PER_DEG_LAT = 1852 * 60;

/** Breadcrumb `meters` north of a base point, `minutes` after T0. */
function crumb(meters: number, minutes: number): Breadcrumb {
  return { lat: 44.3 + meters / M_PER_DEG_LAT, lon: -68.8, t: T0 + minutes * MIN };
}

describe('buildTrackFeature', () => {
  it('draws nothing for empty or single-point tracks', () => {
    expect(buildTrackFeature([]).features).toHaveLength(0);
    expect(buildTrackFeature([crumb(0, 0)]).features).toHaveLength(0);
  });

  it('draws one continuous run as a single line', () => {
    const fc = buildTrackFeature([crumb(0, 0), crumb(200, 1), crumb(400, 2)]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toHaveLength(3);
  });

  it('splits at a time gap over 30 minutes (no line from mooring to launch)', () => {
    const fc = buildTrackFeature([
      crumb(0, 0),
      crumb(200, 1),
      crumb(220, 45), // 44-minute pause
      crumb(400, 46),
    ]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.coordinates).toHaveLength(2);
    expect(fc.features[1].geometry.coordinates).toHaveLength(2);
  });

  it('splits at a distance jump over 1 nm (trailer moves, GPS teleports)', () => {
    const fc = buildTrackFeature([
      crumb(0, 0),
      crumb(200, 1),
      crumb(3000, 2), // ~1.5 nm jump in one minute
      crumb(3200, 3),
    ]);
    expect(fc.features).toHaveLength(2);
  });

  it('drops runs shorter than 2 points instead of drawing dots', () => {
    const fc = buildTrackFeature([
      crumb(0, 0), // lone point, then a long pause
      crumb(200, 60),
      crumb(400, 61),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toHaveLength(2);
  });
});
