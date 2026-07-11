import { describe, expect, it } from 'vitest';
import { createSpeedConsistencyChecker } from './speedConsistency';
import { projectPosition } from '../utils/geometry';
import type { Position } from './types';

const START: Position = { latitude: 44.39, longitude: -68.8 };

/** Simulate `seconds` of 1 Hz self updates: the boat ACTUALLY moves at
 *  `actualMs` along a northerly track while the wire REPORTS `reportedMs`. */
function drive(
  checker: ReturnType<typeof createSpeedConsistencyChecker>,
  seconds: number,
  actualMs: number,
  reportedMs: number,
  startMs = 1_000_000,
) {
  let pos = START;
  for (let s = 0; s <= seconds; s++) {
    checker.sample(startMs + s * 1000, pos, reportedMs);
    pos = projectPosition(pos, 0, actualMs);
  }
}

describe('speed consistency sentinel', () => {
  it('stays quiet on an honest feed (reported matches track)', () => {
    let fired = false;
    const c = createSpeedConsistencyChecker(() => (fired = true));
    drive(c, 120, 5, 5);
    expect(fired).toBe(false);
  });

  it('fires on knots-emitted-as-m/s (reads 1.94× the real speed)', () => {
    let info: { reportedKn: number; derivedKn: number } | null = null;
    const c = createSpeedConsistencyChecker((i) => (info = i));
    // Boat really doing 5 kn = 2.57 m/s; a misconfigured source reports the
    // knots NUMBER (5) on a field the spec says is m/s.
    drive(c, 120, 2.57, 5);
    expect(info).not.toBeNull();
    expect(info!.reportedKn).toBeCloseTo(9.7, 0); // 5 m/s read as ~9.7 kn
    expect(info!.derivedKn).toBeCloseTo(5, 0); // GPS track knows the truth
  });

  it('fires on km/h-as-m/s (3.6× — the other common wire mistake)', () => {
    let fired = false;
    const c = createSpeedConsistencyChecker(() => (fired = true));
    drive(c, 120, 2.57, 9.26); // really 5 kn; wire reports km/h number
    expect(fired).toBe(true);
  });

  it('stays quiet at anchor (GPS jitter over near-zero motion)', () => {
    let fired = false;
    const c = createSpeedConsistencyChecker(() => (fired = true));
    // Anchored: reported 0.1 m/s, position wanders a couple meters per fix.
    let t = 1_000_000;
    for (let s = 0; s <= 180; s++) {
      const jitter = projectPosition(START, (s % 7) * 0.9, s % 3); // ≤2 m wander
      c.sample(t, jitter, 0.1);
      t += 1000;
    }
    expect(fired).toBe(false);
  });

  it('resets on a fix gap instead of integrating across it', () => {
    let fired = false;
    const c = createSpeedConsistencyChecker(() => (fired = true));
    // 30 s of honest data, a 20 s dropout, then 30 s more from a position far
    // along the track — the jump must not be read as speed.
    let pos = START;
    let t = 1_000_000;
    for (let s = 0; s < 30; s++) {
      c.sample(t, pos, 5);
      pos = projectPosition(pos, 0, 5);
      t += 1000;
    }
    t += 20_000;
    pos = projectPosition(pos, 0, 400); // the boat kept going during dropout
    for (let s = 0; s < 30; s++) {
      c.sample(t, pos, 5);
      pos = projectPosition(pos, 0, 5);
      t += 1000;
    }
    expect(fired).toBe(false);
  });

  it('fires at most once per session', () => {
    let count = 0;
    const c = createSpeedConsistencyChecker(() => count++);
    drive(c, 300, 2.57, 5);
    expect(count).toBe(1);
  });

  it('ignores samples with missing or implausible SOG', () => {
    let fired = false;
    const c = createSpeedConsistencyChecker(() => (fired = true));
    let pos = START;
    for (let s = 0; s <= 120; s++) {
      c.sample(1_000_000 + s * 1000, pos, s % 2 === 0 ? undefined : 999);
      pos = projectPosition(pos, 0, 5);
    }
    expect(fired).toBe(false);
  });
});
