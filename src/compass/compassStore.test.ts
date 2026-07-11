// Arbitration between GPS course and the device compass for the own-ship
// triangle. Wrong-side-of-the-threshold mistakes here point the boat icon
// the wrong way, so every branch — including the 1–2 kn hysteresis band —
// is pinned.

import { describe, expect, it } from 'vitest';
import { pickOwnShipHeadingRad } from './compassStore';

const NOW = 1_000_000;
const fresh = { headingRad: 1.0, atMs: NOW - 500 };
const stale = { headingRad: 1.0, atMs: NOW - 10_000 };

const KN = 0.5144; // m/s per knot

describe('pickOwnShipHeadingRad', () => {
  it('clearly underway (≥2 kn): COG wins even with a fresh compass', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 2.5 * KN, compass: fresh, nowMs: NOW }),
    ).toEqual({ headingRad: 2.0, source: 'cog' });
  });

  it('clearly slow (≤1 kn): fresh compass wins over noisy COG', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 0.4 * KN, compass: fresh, nowMs: NOW }),
    ).toEqual({ headingRad: 1.0, source: 'compass' });
  });

  it('in the 1–2 kn band: previous source keeps steering (no flapping)', () => {
    const args = { cogRad: 2.0, sogMs: 1.5 * KN, compass: fresh, nowMs: NOW };
    expect(pickOwnShipHeadingRad({ ...args, prevSource: 'cog' })).toEqual({
      headingRad: 2.0,
      source: 'cog',
    });
    expect(pickOwnShipHeadingRad({ ...args, prevSource: 'compass' })).toEqual({
      headingRad: 1.0,
      source: 'compass',
    });
    // No history yet → compass (the at-rest default).
    expect(pickOwnShipHeadingRad(args)).toEqual({ headingRad: 1.0, source: 'compass' });
  });

  it('stationary with no SOG at all: compass steers', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: undefined, sogMs: undefined, compass: fresh, nowMs: NOW }),
    ).toEqual({ headingRad: 1.0, source: 'compass' });
  });

  it('stale compass: falls back to COG even at low speed', () => {
    expect(pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 0.2, compass: stale, nowMs: NOW })).toEqual({
      headingRad: 2.0,
      source: 'cog',
    });
  });

  it('nothing valid: null (marker keeps default orientation)', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: undefined, sogMs: undefined, compass: stale, nowMs: NOW }),
    ).toBeNull();
  });

  it('invalid COG (degrees leak, >2π) never steers; compass does', () => {
    expect(pickOwnShipHeadingRad({ cogRad: 180, sogMs: 3, compass: fresh, nowMs: NOW })).toEqual({
      headingRad: 1.0,
      source: 'compass',
    });
  });
});

describe('manual heading-mode override', () => {
  it('forced GPS course ignores speed and fresh compass', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 0, compass: fresh, nowMs: NOW, mode: 'cog' }),
    ).toEqual({ headingRad: 2.0, source: 'cog' });
  });

  it('forced GPS course falls back to compass only when COG is dead', () => {
    expect(
      pickOwnShipHeadingRad({
        cogRad: undefined,
        sogMs: 3,
        compass: fresh,
        nowMs: NOW,
        mode: 'cog',
      }),
    ).toEqual({ headingRad: 1.0, source: 'compass' });
  });

  it('forced compass ignores speed', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 5, compass: fresh, nowMs: NOW, mode: 'compass' }),
    ).toEqual({ headingRad: 1.0, source: 'compass' });
  });

  it('forced compass falls back to COG when the sensor goes stale', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 5, compass: stale, nowMs: NOW, mode: 'compass' }),
    ).toEqual({ headingRad: 2.0, source: 'cog' });
  });
});
