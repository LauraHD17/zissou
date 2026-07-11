// @vitest-environment jsdom
//
// Ingest-path regression tests: copy-on-write semantics, future-timestamp
// clamping, prototype-key guards, name truncation, eviction of silent
// targets, and the flood cap. AIS is an unauthenticated radio broadcast —
// this store must stay bounded and never trust wire data blindly.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalKDelta, Vessel } from './types';

const wire = vi.hoisted(() => ({
  handler: null as ((delta: SignalKDelta) => void) | null,
}));

vi.mock('./client', () => ({
  createSignalKClient: () => ({
    subscribe(h: (delta: SignalKDelta) => void) {
      wire.handler = h;
      return () => {
        wire.handler = null;
      };
    },
    close() {
      wire.handler = null;
    },
  }),
}));

import { useAISTargets, useSelf } from './useSignalK';

// Test spy — property mutation (not variable reassignment) keeps the
// react-hooks/globals rule satisfied while the harness mirrors hook output.
const out: { targets: Vessel[]; self: Vessel | undefined } = {
  targets: [],
  self: undefined,
};

function Harness() {
  out.targets = useAISTargets();
  out.self = useSelf();
  return null;
}

function emit(delta: SignalKDelta) {
  act(() => wire.handler?.(delta));
}

function positionDelta(context: string, lat = 44.3, lon = -68.8, timestamp?: string): SignalKDelta {
  return {
    context,
    updates: [
      {
        ...(timestamp ? { timestamp } : {}),
        values: [{ path: 'navigation.position', value: { latitude: lat, longitude: lon } }],
      },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup(); // unmount → refcount 0 → deferred releaseClient clears the store
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
});

describe('ingest', () => {
  it('separates self from AIS targets', () => {
    render(<Harness />);
    emit(positionDelta('vessels.self'));
    emit(positionDelta('vessels.urn:mrn:imo:mmsi:367000001'));
    expect(out.self?.context).toBe('vessels.self');
    expect(out.targets.map((v) => v.context)).toEqual(['vessels.urn:mrn:imo:mmsi:367000001']);
  });

  it('is copy-on-write: updates produce a fresh vessel object', () => {
    render(<Harness />);
    emit(positionDelta('vessels.a', 44.3));
    const first = out.targets[0];
    emit(positionDelta('vessels.a', 44.31));
    const second = out.targets[0];
    expect(second).not.toBe(first);
    expect(first.position?.latitude).toBe(44.3); // old snapshot untouched
    expect(second.position?.latitude).toBe(44.31);
  });

  it('clamps future timestamps to now — spoofed clocks cannot defeat staleness', () => {
    render(<Harness />);
    emit(positionDelta('vessels.a', 44.3, -68.8, '2035-01-01T00:00:00Z'));
    expect(out.targets[0].lastUpdated).toBeLessThanOrEqual(Date.now());
  });

  it('ignores __proto__ path keys — no prototype pollution', () => {
    render(<Harness />);
    emit({
      context: 'vessels.a',
      updates: [
        {
          values: [
            { path: '__proto__', value: { polluted: true } },
            { path: 'navigation.position', value: { latitude: 44.3, longitude: -68.8 } },
          ],
        },
      ],
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(out.targets[0].paths, '__proto__')).toBe(false);
  });

  it('truncates absurdly long vessel names', () => {
    render(<Harness />);
    emit({
      context: 'vessels.a',
      updates: [{ values: [{ path: 'name', value: 'X'.repeat(500) }] }],
    });
    expect(out.targets[0].name?.length).toBeLessThanOrEqual(40);
  });
});

describe('eviction', () => {
  it('drops targets silent for 30+ minutes; self survives', () => {
    render(<Harness />);
    emit(positionDelta('vessels.self'));
    emit(positionDelta('vessels.a'));
    expect(out.targets).toHaveLength(1);

    // 31 minutes of sweep ticks with no further deltas from vessels.a.
    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000);
    });
    expect(out.targets).toHaveLength(0);
    expect(out.self?.context).toBe('vessels.self');
  });

  it('caps tracked targets; existing targets keep updating at the cap', () => {
    render(<Harness />);
    for (let i = 0; i < 520; i++) {
      emit(positionDelta(`vessels.flood-${i}`));
    }
    expect(out.targets.length).toBe(500);
    // An already-tracked vessel still updates.
    emit(positionDelta('vessels.flood-0', 44.99));
    expect(out.targets.find((v) => v.context === 'vessels.flood-0')?.position?.latitude).toBe(
      44.99,
    );
  });
});
