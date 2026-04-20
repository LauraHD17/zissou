import { describe, expect, it } from 'vitest';
import { detectDwells, tagDwell, DWELL_MIN_MS } from './dwellDetector';
import type { Breadcrumb } from './breadcrumbStore';

const HOUR = 60 * 60 * 1000;

function crumb(lat: number, lon: number, t: number, sogMs = 0): Breadcrumb {
  return { lat, lon, t, sogMs };
}

describe('detectDwells', () => {
  it('returns empty for < 2 points', () => {
    expect(detectDwells([])).toEqual([]);
    expect(detectDwells([crumb(44.4, -68.8, 0)])).toEqual([]);
  });

  it('finds a single dwell when boat stays in a small area for > 2 hours', () => {
    const start = Date.now() - 3 * HOUR;
    const points = Array.from({ length: 30 }, (_, i) =>
      crumb(44.4 + i * 0.00001, -68.8 + i * 0.00001, start + i * (6 * 60 * 1000)),
    );
    const dwells = detectDwells(points);
    expect(dwells).toHaveLength(1);
    expect(dwells[0].durationMs).toBeGreaterThanOrEqual(DWELL_MIN_MS);
  });

  it('does not flag a quick stop (< 2 hours) as a dwell', () => {
    const start = Date.now() - HOUR; // only 1 hour
    const points = [
      crumb(44.4, -68.8, start),
      crumb(44.4, -68.8, start + 30 * 60 * 1000),
      crumb(44.4, -68.8, start + HOUR),
    ];
    expect(detectDwells(points)).toEqual([]);
  });

  it('splits two separate dwells when the boat moves between them', () => {
    const base = Date.now() - 10 * HOUR;
    // Dwell A at (44.4, -68.8) for 3h, then travel, then dwell B at (44.5, -68.9) for 3h.
    const pA = Array.from({ length: 20 }, (_, i) =>
      crumb(44.4, -68.8, base + i * (10 * 60 * 1000)),
    );
    const travel = [crumb(44.45, -68.85, base + 4 * HOUR)];
    const pB = Array.from({ length: 20 }, (_, i) =>
      crumb(44.5, -68.9, base + 5 * HOUR + i * (10 * 60 * 1000)),
    );
    const dwells = detectDwells([...pA, ...travel, ...pB]);
    expect(dwells).toHaveLength(2);
  });
});

describe('tagDwell', () => {
  it('tags a long stop spanning 2–5am local as overnight anchorage', () => {
    // Start 22:00 local, end 08:00 local next day — spans deep night.
    const start = new Date();
    start.setHours(22, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(8, 0, 0, 0);
    const dwell = {
      id: 'x',
      center: { latitude: 44.4, longitude: -68.8 },
      startedAt: start.getTime(),
      endedAt: end.getTime(),
      durationMs: end.getTime() - start.getTime(),
      pointCount: 20,
    };
    expect(tagDwell(dwell)).toBe('anchorage-overnight');
  });

  it('tags a daytime 3-hour stop as mooring (short daytime dwell)', () => {
    // Start 10:00 local, end 13:00 local — daytime only, spans nothing overnight.
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(13, 0, 0, 0);
    const dwell = {
      id: 'x',
      center: { latitude: 44.4, longitude: -68.8 },
      startedAt: start.getTime(),
      endedAt: end.getTime(),
      durationMs: end.getTime() - start.getTime(),
      pointCount: 20,
    };
    expect(tagDwell(dwell)).toBe('mooring');
  });

  it('tags a daytime 8-hour stop as anchorage (long, no deep-night span)', () => {
    // Start 08:00 local, end 16:00 local — 8 hours during the day.
    const start = new Date();
    start.setHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setHours(16, 0, 0, 0);
    const dwell = {
      id: 'x',
      center: { latitude: 44.4, longitude: -68.8 },
      startedAt: start.getTime(),
      endedAt: end.getTime(),
      durationMs: end.getTime() - start.getTime(),
      pointCount: 20,
    };
    expect(tagDwell(dwell)).toBe('anchorage');
  });
});
