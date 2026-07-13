import { describe, expect, it } from 'vitest';
import type { Position, Vessel } from '../signalk/types';
import { OWN_NAME_PLACEHOLDER, buildVhfScript, spokenLatLon } from './vhfScript';

const BASE: Position = { latitude: 44.3, longitude: -68.8 };
const M_PER_DEG_LAT = 1852 * 60;

/** Position `meters` due north of BASE. */
function north(meters: number): Position {
  return { latitude: BASE.latitude + meters / M_PER_DEG_LAT, longitude: BASE.longitude };
}

function vessel(over: Partial<Vessel> = {}): Vessel {
  return { context: 'vessels.test', lastUpdated: Date.now(), paths: {}, ...over };
}

describe('buildVhfScript', () => {
  const self = vessel({ context: 'vessels.self', position: BASE });

  it('hails a named vessel twice and identifies own boat', () => {
    const script = buildVhfScript(vessel({ name: 'ELLA MAE', position: north(500) }), self, 'Sisu');
    expect(script.calleeName).toBe('ELLA MAE');
    expect(script.lines[0]).toBe('ELLA MAE, ELLA MAE, this is Sisu, over.');
    expect(script.missingOwnName).toBe(false);
  });

  it('describes own position from the TARGET’s perspective', () => {
    // Target 500 m north of us — from their deck, we are to their south.
    const script = buildVhfScript(vessel({ name: 'ELLA MAE', position: north(500) }), self, 'Sisu');
    expect(script.lines[1]).toBe('I am the vessel 500 meters (547 yards) to your south.');
  });

  it('includes a spoken-coordinate readback of own position', () => {
    const script = buildVhfScript(vessel({ name: 'ELLA MAE', position: north(500) }), self, 'Sisu');
    expect(script.lines[2]).toBe(
      'My position is 44 degrees 18.0 minutes North, 068 degrees 48.0 minutes West.',
    );
  });

  it('hails a nameless vessel by MMSI, digits spaced for speaking', () => {
    const script = buildVhfScript(
      vessel({ mmsi: '368001234', position: north(500) }),
      self,
      'Sisu',
    );
    expect(script.calleeName).toBe('Vessel with MMSI 3 6 8 0 0 1 2 3 4');
  });

  it('hails a nameless no-MMSI vessel by its position', () => {
    const script = buildVhfScript(vessel({ position: north(500) }), self, 'Sisu');
    expect(script.calleeName).toMatch(/^Vessel near 44\.3\d+° N, 68\.8000° W$/);
  });

  it('falls back to "Unknown vessel" with no identity at all', () => {
    expect(buildVhfScript(vessel(), self, 'Sisu').calleeName).toBe('Unknown vessel');
  });

  it('omits the relative-position line when the target position is implausible', () => {
    const script = buildVhfScript(
      vessel({ name: 'GHOST', position: { latitude: 0, longitude: 0 } }),
      self,
      'Sisu',
    );
    expect(script.lines).toHaveLength(2); // hail + own readback only
    expect(script.lines[1]).toMatch(/^My position is/);
  });

  it('omits position lines entirely when self has no fix', () => {
    const script = buildVhfScript(
      vessel({ name: 'ELLA MAE', position: north(500) }),
      undefined,
      'Sisu',
    );
    expect(script.lines).toEqual(['ELLA MAE, ELLA MAE, this is Sisu, over.']);
  });

  it('uses a placeholder and flags it when the boat name is unset', () => {
    for (const unset of ['', '—']) {
      const script = buildVhfScript(vessel({ name: 'ELLA MAE' }), self, unset);
      expect(script.lines[0]).toContain(OWN_NAME_PLACEHOLDER);
      expect(script.missingOwnName).toBe(true);
    }
  });
});

describe('spokenLatLon', () => {
  it('speaks degrees-decimal-minutes with hemispheres', () => {
    expect(spokenLatLon(44.395, -68.7896)).toBe(
      '44 degrees 23.7 minutes North, 068 degrees 47.4 minutes West',
    );
  });

  it('handles southern and eastern hemispheres', () => {
    expect(spokenLatLon(-33.8568, 151.2153)).toBe(
      '33 degrees 51.4 minutes South, 151 degrees 12.9 minutes East',
    );
  });

  it('carries 60.0-minute rounding into the degree', () => {
    expect(spokenLatLon(44.9999, -68.9999)).toBe(
      '45 degrees 0.0 minutes North, 069 degrees 0.0 minutes West',
    );
  });
});
