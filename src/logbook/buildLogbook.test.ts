import { describe, expect, it } from 'vitest';
import type { Breadcrumb } from '../breadcrumbs/breadcrumbStore';
import type { SavedWaypoint } from '../types/nav';
import { buildLogbookDays, formatLogbookEntry } from './buildLogbook';

const M_PER_DEG_LAT = 1852 * 60;
const BASE = { lat: 44.3, lon: -68.8 };

/** Local-time helper: Jul 13 2026 at hh:mm. */
function at(day: number, hours: number, minutes = 0): number {
  return new Date(2026, 6, day, hours, minutes, 0).getTime();
}

function crumb(metersNorth: number, t: number): Breadcrumb {
  return { lat: BASE.lat + metersNorth / M_PER_DEG_LAT, lon: BASE.lon, t };
}

/** A dwell needs ≥3 points within ~55 m spanning ≥2 h. */
function dwellCrumbs(metersNorth: number, from: number, toT: number): Breadcrumb[] {
  const mid = from + (toT - from) / 2;
  return [crumb(metersNorth, from), crumb(metersNorth + 10, mid), crumb(metersNorth, toT)];
}

/** An underway run of `points` crumbs, 60 m apart, 1 min apart. */
function runCrumbs(startMeters: number, startT: number, points: number): Breadcrumb[] {
  return Array.from({ length: points }, (_, i) =>
    crumb(startMeters + (i + 1) * 60, startT + (i + 1) * 60_000),
  );
}

function waypoint(over: Partial<SavedWaypoint> = {}): SavedWaypoint {
  return {
    id: 'wp-1',
    lat: BASE.lat,
    lon: BASE.lon,
    label: 'Castine mooring',
    category: 'mooring',
    createdAt: 0,
    ...over,
  };
}

describe('buildLogbookDays', () => {
  it('returns nothing for empty input', () => {
    expect(buildLogbookDays({ crumbs: [], waypoints: [], events: [] })).toEqual([]);
  });

  it('logs a simple day: moored overnight, departed, distance run', () => {
    const crumbs = [
      ...dwellCrumbs(0, at(13, 5, 0), at(13, 9, 12)), // at the mooring 5:00–9:12 AM
      ...runCrumbs(0, at(13, 9, 12), 20), // then underway
    ];
    const days = buildLogbookDays({ crumbs, waypoints: [waypoint()], events: [] });
    expect(days).toHaveLength(1);
    const lines = days[0].lines;
    expect(lines[0]).toBe('Moored Castine mooring 5:00 AM · 4 hr');
    expect(lines[1]).toBe('Departed Castine mooring 9:12 AM');
    expect(lines[lines.length - 1]).toMatch(/^Distance run /);
    expect(days[0].distanceNm).toBeGreaterThan(0.5);
  });

  it('names unmatched stops with honest coordinates, not invented names', () => {
    const crumbs = [
      ...dwellCrumbs(0, at(13, 5, 0), at(13, 9, 0)),
      ...runCrumbs(0, at(13, 9, 0), 20),
    ];
    const days = buildLogbookDays({ crumbs, waypoints: [], events: [] });
    expect(days[0].lines[0]).toMatch(/^Moored 44\.3\d+° N -?68\.8000° W 5:00 AM/);
  });

  it('classifies an overnight stop as anchored', () => {
    // Dwell spanning 22:00 → 07:00 crosses deep night (02:00–05:00).
    const crumbs = [
      ...dwellCrumbs(0, at(12, 22, 0), at(13, 7, 0)),
      ...runCrumbs(0, at(13, 7, 0), 20),
    ];
    const days = buildLogbookDays({ crumbs, waypoints: [], events: [] });
    // Stop is logged on the day it began (Jul 12), departure on Jul 13.
    const jul12 = days.find((d) => d.title === 'Jul 12')!;
    const jul13 = days.find((d) => d.title === 'Jul 13')!;
    expect(jul12.lines[0]).toMatch(/^Anchored /);
    expect(jul13.lines[0]).toMatch(/^Departed /);
  });

  it('interleaves recorded events chronologically', () => {
    const crumbs = runCrumbs(0, at(13, 9, 0), 30);
    const days = buildLogbookDays({
      crumbs,
      waypoints: [],
      events: [
        { kind: 'anchor-set', t: at(13, 18, 30) },
        { kind: 'mob', t: at(13, 10, 5) },
        { kind: 'waypoint-saved', t: at(13, 11, 0), label: 'Ledge off Nautilus' },
      ],
    });
    expect(days).toHaveLength(1);
    const lines = days[0].lines;
    expect(lines[0]).toBe('MOB marked 10:05 AM');
    expect(lines[1]).toBe('Saved "Ledge off Nautilus" 11:00 AM');
    expect(lines[2]).toBe('Anchor watch set 6:30 PM');
  });

  it('groups multiple days newest-first', () => {
    const crumbs = [...runCrumbs(0, at(12, 9, 0), 20), ...runCrumbs(5000, at(13, 9, 0), 20)];
    const days = buildLogbookDays({ crumbs, waypoints: [], events: [] });
    expect(days.map((d) => d.title)).toEqual(['Jul 13', 'Jul 12']);
  });

  it('does not count trailer moves or long gaps as distance run', () => {
    const crumbs = [
      ...runCrumbs(0, at(13, 9, 0), 5), // ~300 m on the water
      crumb(50_000, at(13, 12, 0)), // 27 nm teleport (trailered)
      ...runCrumbs(50_000, at(13, 12, 5), 5),
    ];
    const days = buildLogbookDays({ crumbs, waypoints: [], events: [] });
    expect(days[0].distanceNm).toBeLessThan(1);
  });
});

describe('formatLogbookEntry', () => {
  it('renders a shareable multi-line block', () => {
    const text = formatLogbookEntry({
      dayStart: at(13, 0),
      title: 'Jul 13',
      lines: ['Departed Castine 9:12 AM', 'Distance run 14.2 nautical miles (16.3 miles)'],
      distanceNm: 14.2,
    });
    expect(text).toBe(
      'Jul 13\nDeparted Castine 9:12 AM\nDistance run 14.2 nautical miles (16.3 miles)',
    );
  });
});
