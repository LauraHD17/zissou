// @vitest-environment jsdom
//
// Pins the breadcrumb write cadence: at cruising speed the recorder must
// append at most once per 30 s (time gate AND distance gate). The original
// OR gate appended every ~4 s underway, rewriting a multi-hundred-KB blob to
// localStorage each time — SD-card wear and main-thread jank on the Pi.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vessel } from '../signalk/types';
import { clearBreadcrumbs, readBreadcrumbs } from './breadcrumbStore';
import { useBreadcrumbRecorder } from './useBreadcrumbRecorder';

const gps = vi.hoisted(() => ({ self: undefined as Vessel | undefined }));

vi.mock('../signalk/useSignalK', () => ({
  useSelf: () => gps.self,
}));

const BASE = { latitude: 44.3, longitude: -68.8 };
const M_PER_DEG_LAT = 1852 * 60;

function ownShipAt(metersNorth: number): Vessel {
  return {
    context: 'vessels.self',
    lastUpdated: Date.now(),
    paths: {},
    position: { latitude: BASE.latitude + metersNorth / M_PER_DEG_LAT, longitude: BASE.longitude },
    sog: 2.5, // ~5 kn
  };
}

function Harness() {
  useBreadcrumbRecorder();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  clearBreadcrumbs();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('breadcrumb cadence', () => {
  it('appends at most once per 30 s while cruising (1 Hz GPS)', () => {
    gps.self = ownShipAt(0);
    const view = render(<Harness />);

    // 120 s of cruising at ~2.5 m/s with a fresh GPS fix every second.
    for (let t = 1; t <= 120; t++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      gps.self = ownShipAt(2.5 * t);
      view.rerender(<Harness />);
    }

    // t=0 plus one per full 30 s elapsed → 5 max.
    expect(readBreadcrumbs().length).toBeLessThanOrEqual(5);
    expect(readBreadcrumbs().length).toBeGreaterThanOrEqual(4);
  });

  it('records nothing while moored (no movement)', () => {
    gps.self = ownShipAt(0);
    const view = render(<Harness />);
    const initial = readBreadcrumbs().length; // the first fix seeds one point

    for (let t = 1; t <= 90; t++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      gps.self = { ...ownShipAt(0), lastUpdated: Date.now() };
      view.rerender(<Harness />);
    }

    expect(readBreadcrumbs().length).toBe(initial);
  });
});
