// @vitest-environment jsdom
//
// Regression tests for the alarm-system interplay bugs found in the 2026-07
// audit: the anchor-drag watch used to clear ANY active alarm every second
// while underway (kind-blind clearAlarm), the hazard watch never re-evaluated
// (stale effect deps), and raiseAlarm resurrected acknowledged alarms as
// fresh-unacknowledged on every tick.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAnchor, dropAnchor } from '../anchor/anchorStore';
import { useAnchorDragWatch } from '../anchor/useAnchorDragWatch';
import type { Vessel } from '../signalk/types';
import { addWaypoint, readWaypoints, removeWaypoint } from '../waypoints/waypointStore';
import { useHazardProximityWatch } from '../waypoints/useHazardProximityWatch';
import { acknowledgeAlarm, clearAlarm, readActiveAlarm } from './alarmStore';

const gps = vi.hoisted(() => ({ self: undefined as Vessel | undefined }));

// Both watches read own-ship through useSelf; feed them a controllable value.
vi.mock('../signalk/useSignalK', () => ({
  useSelf: () => gps.self,
}));

// jsdom has no AudioContext.
vi.mock('./useAlarmAudio', () => ({
  playAnchorAlarmTone: () => {},
}));

const BASE = { latitude: 44.3, longitude: -68.8 };
const M_PER_DEG_LAT = 1852 * 60;

function north(meters: number) {
  return { latitude: BASE.latitude + meters / M_PER_DEG_LAT, longitude: BASE.longitude };
}

function ownShip(position: { latitude: number; longitude: number }): Vessel {
  return { context: 'vessels.self', lastUpdated: Date.now(), paths: {}, position };
}

/** Mounts both watches exactly as ChartCanvas does. */
function Harness() {
  useHazardProximityWatch();
  useAnchorDragWatch();
  return null;
}

function tick(seconds = 1) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  gps.self = ownShip(BASE);
  clearAlarm();
  clearAnchor();
  for (const w of readWaypoints()) removeWaypoint(w.id);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('hazard-proximity alarm while underway (no anchor watch set)', () => {
  it('raises when within alarm range of a hazard and SURVIVES the 1 Hz ticks', () => {
    addWaypoint({
      lat: north(100).latitude,
      lon: BASE.longitude,
      label: 'Ledge',
      category: 'hazard',
    });
    render(<Harness />);

    expect(readActiveAlarm()?.kind).toBe('hazard-proximity');

    // The old kind-blind clearAlarm in useAnchorDragWatch wiped this within 1 s.
    tick(3);
    expect(readActiveAlarm()?.kind).toBe('hazard-proximity');
  });

  it('acknowledge sticks while the condition persists', () => {
    addWaypoint({
      lat: north(100).latitude,
      lon: BASE.longitude,
      label: 'Ledge',
      category: 'hazard',
    });
    render(<Harness />);

    const raisedAt = readActiveAlarm()?.raisedAt;
    act(() => acknowledgeAlarm());
    tick(5);

    const alarm = readActiveAlarm();
    expect(alarm?.kind).toBe('hazard-proximity');
    expect(alarm?.acknowledged).toBe(true);
    expect(alarm?.raisedAt).toBe(raisedAt);
  });

  it('re-evaluates as the boat moves: no alarm far away, alarm on approach, clear on retreat', () => {
    addWaypoint({
      lat: north(100).latitude,
      lon: BASE.longitude,
      label: 'Ledge',
      category: 'hazard',
    });
    gps.self = ownShip(north(5000)); // ~2.6 nm away
    render(<Harness />);
    expect(readActiveAlarm()).toBeNull();

    // Approach to within 50 m of the hazard — the old stale-deps bug meant
    // this re-evaluation never happened until the waypoint list was edited.
    gps.self = ownShip(north(150));
    tick(1);
    expect(readActiveAlarm()?.kind).toBe('hazard-proximity');

    gps.self = ownShip(north(5000));
    tick(1);
    expect(readActiveAlarm()).toBeNull();
  });
});

describe('anchor-drag alarm episodes', () => {
  it('raises on drag, keeps acknowledgement, clears when back inside, re-raises fresh on a new drag', () => {
    act(() => dropAnchor({ drop: BASE, radiusFt: 100, audioEnabled: false }));
    render(<Harness />);

    // Drift 100 m (~328 ft) outside the 100 ft circle.
    gps.self = ownShip(north(100));
    tick(1);
    expect(readActiveAlarm()?.kind).toBe('anchor-drag');

    act(() => acknowledgeAlarm());
    tick(3);
    expect(readActiveAlarm()?.acknowledged).toBe(true);

    // Back inside the circle — episode over, alarm clears.
    gps.self = ownShip(BASE);
    tick(1);
    expect(readActiveAlarm()).toBeNull();

    // Drag out again — NEW episode, fresh unacknowledged alarm.
    gps.self = ownShip(north(100));
    tick(1);
    expect(readActiveAlarm()?.kind).toBe('anchor-drag');
    expect(readActiveAlarm()?.acknowledged).toBe(false);
  });

  it('does not clear a hazard alarm it does not own', () => {
    addWaypoint({
      lat: north(100).latitude,
      lon: BASE.longitude,
      label: 'Ledge',
      category: 'hazard',
    });
    render(<Harness />);
    expect(readActiveAlarm()?.kind).toBe('hazard-proximity');

    // Anchor watch turned on then off mid-alarm must not swallow the hazard
    // alarm. Drop the anchor AT our position so the drag watch stays quiet.
    act(() => dropAnchor({ drop: BASE, radiusFt: 100, audioEnabled: false }));
    tick(1);
    act(() => clearAnchor());
    tick(1);
    expect(readActiveAlarm()?.kind).toBe('hazard-proximity');
  });
});
