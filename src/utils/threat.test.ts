import { describe, expect, it } from 'vitest';
import type { Position, Vessel } from '../signalk/types';
import {
  HAZARD_ALARM_METERS,
  closingSpeedMs,
  computeHazardThreatBand,
  computeThreatBand,
  isHeadingTowardHazard,
} from './threat';

const BASE: Position = { latitude: 44.3, longitude: -68.8 };
const M_PER_DEG_LAT = 1852 * 60; // 1 minute of latitude = 1 nm

/** Position `meters` due north of BASE. */
function north(meters: number): Position {
  return { latitude: BASE.latitude + meters / M_PER_DEG_LAT, longitude: BASE.longitude };
}

/** Position `meters` due east of BASE (corrected for latitude compression). */
function east(meters: number): Position {
  return {
    latitude: BASE.latitude,
    longitude:
      BASE.longitude + meters / (M_PER_DEG_LAT * Math.cos((BASE.latitude * Math.PI) / 180)),
  };
}

function vessel(over: Partial<Vessel> = {}): Vessel {
  return { context: 'vessels.test', lastUpdated: Date.now(), paths: {}, ...over };
}

const NORTH = 0;
const EAST = Math.PI / 2;
const SOUTH = Math.PI;

describe('computeThreatBand — conservative on bad data', () => {
  const self = vessel({ position: BASE, sog: 0, cog: NORTH });

  it('stale target is monitor even 50 m away', () => {
    expect(computeThreatBand(vessel({ position: north(50) }), self, true)).toBe('monitor');
  });

  it('target without position is monitor', () => {
    expect(computeThreatBand(vessel(), self, false)).toBe('monitor');
  });

  it('target with implausible position is monitor', () => {
    expect(
      computeThreatBand(vessel({ position: { latitude: 0, longitude: 0 } }), self, false),
    ).toBe('monitor');
  });

  it('missing own position is monitor', () => {
    expect(computeThreatBand(vessel({ position: north(50) }), undefined, false)).toBe('monitor');
    expect(computeThreatBand(vessel({ position: north(50) }), vessel(), false)).toBe('monitor');
  });

  it('shore-relayed target is monitor even 50 m away and closing', () => {
    // Internet-AIS positions can be minutes old — a relayed report must never
    // drive a caution/danger warning no matter how close it looks.
    const closing = vessel({ position: north(50), relayed: true, sog: 5, cog: SOUTH });
    expect(computeThreatBand(closing, vessel({ position: BASE, sog: 0, cog: NORTH }), false)).toBe(
      'monitor',
    );
  });
});

describe('computeThreatBand — distance thresholds', () => {
  const self = vessel({ position: BASE });

  it('inside 200 m is danger regardless of motion data', () => {
    expect(computeThreatBand(vessel({ position: north(150) }), self, false)).toBe('danger');
  });

  it('just outside 200 m without motion data is caution (<500 m rule)', () => {
    expect(computeThreatBand(vessel({ position: north(210) }), self, false)).toBe('caution');
  });

  it('beyond 500 m without motion data is monitor', () => {
    expect(computeThreatBand(vessel({ position: north(600) }), self, false)).toBe('monitor');
  });
});

describe('computeThreatBand — closing-speed bands', () => {
  // Own ship stationary at BASE with valid motion data (sog 0, cog north).
  const self = vessel({ position: BASE, sog: 0, cog: NORTH });

  it('0.38 nm away, closing in ~2.3 min → danger', () => {
    // 700 m due north, steaming due south at 5 m/s: tcpa ≈ 700/5/60 = 2.3 min.
    const target = vessel({ position: north(700), sog: 5, cog: SOUTH });
    expect(computeThreatBand(target, self, false)).toBe('danger');
  });

  it('same geometry but opening (moving away) → monitor', () => {
    const target = vessel({ position: north(700), sog: 5, cog: NORTH });
    expect(computeThreatBand(target, self, false)).toBe('monitor');
  });

  it('0.86 nm away, closing in ~5.3 min → caution (<1 nm, <8 min rule)', () => {
    const target = vessel({ position: north(1600), sog: 5, cog: SOUTH });
    expect(computeThreatBand(target, self, false)).toBe('caution');
  });

  it('1.6 nm away, closing in 10 min → caution (<2 nm, <15 min rule)', () => {
    const target = vessel({ position: north(3000), sog: 5, cog: SOUTH });
    expect(computeThreatBand(target, self, false)).toBe('caution');
  });

  it('1.6 nm away, closing in 25 min → monitor (too slow to worry)', () => {
    const target = vessel({ position: north(3000), sog: 2, cog: SOUTH });
    expect(computeThreatBand(target, self, false)).toBe('monitor');
  });

  it('crossing traffic with no closing component → monitor', () => {
    // 700 m north, steaming due east — perpendicular, closing ≈ 0.
    const target = vessel({ position: north(700), sog: 5, cog: EAST });
    expect(computeThreatBand(target, self, false)).toBe('monitor');
  });

  it('invalid COG (degrees leaking through, > 2π) degrades to the no-motion rules', () => {
    const target = vessel({ position: north(700), sog: 5, cog: 180 });
    expect(computeThreatBand(target, self, false)).toBe('monitor'); // >500 m, no motion
  });
});

describe('closingSpeedMs — sign convention', () => {
  it('positive when the gap is shrinking', () => {
    // A at BASE moving north at 5 m/s toward B (1 km north, stationary).
    expect(closingSpeedMs(BASE, 5, NORTH, north(1000), 0, NORTH)).toBeCloseTo(5, 3);
  });

  it('negative when the gap is growing', () => {
    expect(closingSpeedMs(BASE, 5, SOUTH, north(1000), 0, NORTH)).toBeCloseTo(-5, 3);
  });

  it('~zero for perpendicular motion', () => {
    expect(closingSpeedMs(BASE, 5, EAST, north(1000), 0, NORTH)).toBeCloseTo(0, 2);
  });

  it('sums both vessels moving toward each other', () => {
    expect(closingSpeedMs(BASE, 3, NORTH, north(1000), 4, SOUTH)).toBeCloseTo(7, 3);
  });
});

describe('isHeadingTowardHazard', () => {
  // Directional logic only applies when making way — 3 m/s ≈ 5.8 kn.
  it('true when hazard is dead ahead', () => {
    const self = vessel({ position: BASE, cog: NORTH, sog: 3 });
    expect(isHeadingTowardHazard(self, north(500))).toBe(true);
  });

  it('false when hazard is abeam (90° off the bow)', () => {
    const self = vessel({ position: BASE, cog: NORTH, sog: 3 });
    expect(isHeadingTowardHazard(self, east(500))).toBe(false);
  });

  it('handles the 0/360 wraparound: COG 350°, hazard bearing ~000° → true', () => {
    const self = vessel({ position: BASE, cog: (350 * Math.PI) / 180, sog: 3 });
    expect(isHeadingTowardHazard(self, north(500))).toBe(true);
  });

  it('unknown COG is conservative → true', () => {
    const self = vessel({ position: BASE, sog: 3 });
    expect(isHeadingTowardHazard(self, north(500))).toBe(true);
  });

  it('invalid COG (out of radian range) is conservative → true', () => {
    const self = vessel({ position: BASE, cog: 350, sog: 3 });
    expect(isHeadingTowardHazard(self, north(500))).toBe(true);
  });

  it('drifting below steerage way: COG is noise, stays conservative → true even abeam', () => {
    const self = vessel({ position: BASE, cog: NORTH, sog: 0.1 });
    expect(isHeadingTowardHazard(self, east(500))).toBe(true);
  });

  it('unknown SOG with a COG present is conservative → true even abeam', () => {
    const self = vessel({ position: BASE, cog: NORTH });
    expect(isHeadingTowardHazard(self, east(500))).toBe(true);
  });

  it('no own position → false (nothing to compare)', () => {
    expect(isHeadingTowardHazard(vessel(), north(500))).toBe(false);
  });
});

describe('computeHazardThreatBand', () => {
  const self = vessel({ position: BASE });

  it('danger inside the alarm radius', () => {
    const r = computeHazardThreatBand(north(HAZARD_ALARM_METERS - 20), self);
    expect(r?.band).toBe('danger');
  });

  it('caution inside 0.5 nm', () => {
    expect(computeHazardThreatBand(north(700), self)?.band).toBe('caution');
  });

  it('monitor inside the 2 nm list range', () => {
    expect(computeHazardThreatBand(north(1852 * 1.5), self)?.band).toBe('monitor');
  });

  it('null beyond the list range (hidden)', () => {
    expect(computeHazardThreatBand(north(1852 * 2.5), self)).toBeNull();
  });

  it('null without a plausible own position', () => {
    expect(computeHazardThreatBand(north(100), undefined)).toBeNull();
    expect(
      computeHazardThreatBand(north(100), vessel({ position: { latitude: 0, longitude: 0 } })),
    ).toBeNull();
  });
});
