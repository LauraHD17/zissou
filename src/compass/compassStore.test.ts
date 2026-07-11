// Arbitration between GPS course and the device compass for the own-ship
// triangle. Wrong-side-of-the-threshold mistakes here point the boat icon
// the wrong way, so every branch is pinned.

import { describe, expect, it } from 'vitest';
import { pickOwnShipHeadingRad } from './compassStore';

const NOW = 1_000_000;
const fresh = { headingRad: 1.0, atMs: NOW - 500 };
const stale = { headingRad: 1.0, atMs: NOW - 10_000 };

describe('pickOwnShipHeadingRad', () => {
  it('underway: COG wins even with a fresh compass', () => {
    expect(pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 2.5, compass: fresh, nowMs: NOW })).toBe(
      2.0,
    );
  });

  it('below steerage way: fresh compass wins over noisy COG', () => {
    expect(pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 0.2, compass: fresh, nowMs: NOW })).toBe(
      1.0,
    );
  });

  it('stationary with no SOG at all: compass steers', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: undefined, sogMs: undefined, compass: fresh, nowMs: NOW }),
    ).toBe(1.0);
  });

  it('stale compass: falls back to COG even at low speed', () => {
    expect(pickOwnShipHeadingRad({ cogRad: 2.0, sogMs: 0.2, compass: stale, nowMs: NOW })).toBe(
      2.0,
    );
  });

  it('nothing valid: null (marker keeps default orientation)', () => {
    expect(
      pickOwnShipHeadingRad({ cogRad: undefined, sogMs: undefined, compass: stale, nowMs: NOW }),
    ).toBeNull();
  });

  it('invalid COG (degrees leak, >2π) never steers; compass does', () => {
    expect(pickOwnShipHeadingRad({ cogRad: 180, sogMs: 3, compass: fresh, nowMs: NOW })).toBe(1.0);
  });
});
