// Device-compass heading for the phone (geo) build.
//
// GPS course-over-ground says which way you're MOVING — right for a boat
// underway, useless while drifting or standing at the dock rotating the
// phone (the "Google Maps swivels instantly" expectation). The phone's
// magnetometer fills that gap. Arbitration lives in pickOwnShipHeadingRad:
// compass steers the own-ship triangle below steerage way or when COG is
// invalid; COG wins underway (truer than a compass on a rocking boat).
//
// iOS requires a user-gesture permission request (handled by
// CompassEnablePill); every failure path falls back to today's COG-only
// behavior.

import { defineStore, defineMemoryStore } from '../storage/localStore';
import { isValidCogRad, isValidSogMs } from '../signalk/types';

export interface CompassReading {
  /** TRUE heading, radians 0..2π. */
  headingRad: number;
  atMs: number;
}

// Magnetic → true correction for the cruising ground. Penobscot Bay
// variation is ~15° W (2026, slowly decreasing): "variation west, compass
// best" → true = magnetic − 15°. Good to ~±1° bay-wide.
// TODO: replace with a proper World Magnetic Model lookup if cruising far
// from mid-coast Maine.
const DECLINATION_WEST_DEG = 15.0;

const reading = defineMemoryStore<CompassReading | null>(null);
// Remember a successful grant so later launches can re-arm without the pill.
const granted = defineStore<{ ok: boolean }>('nav.compass.v1', 1, { ok: false });

export function useCompassReading(): CompassReading | null {
  return reading.use();
}

export function readCompassReading(): CompassReading | null {
  return reading.read();
}

export function useCompassGranted(): boolean {
  return granted.use().ok;
}

export function compassSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

let listening = false;
let lastStored = 0;

function onOrientation(e: DeviceOrientationEvent): void {
  // iOS exposes webkitCompassHeading: degrees CLOCKWISE from magnetic north.
  // Elsewhere, an absolute alpha is degrees COUNTER-clockwise from north.
  const ios = (e as IOSOrientationEvent).webkitCompassHeading;
  let magneticDeg: number | null = null;
  if (typeof ios === 'number' && Number.isFinite(ios)) {
    magneticDeg = ios;
  } else if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
    magneticDeg = (360 - e.alpha) % 360;
  }
  if (magneticDeg == null) return;

  const now = Date.now();
  if (now - lastStored < 150) return; // sensor fires ~60 Hz; 6-7 Hz is plenty
  lastStored = now;

  const trueDeg = (((magneticDeg - DECLINATION_WEST_DEG) % 360) + 360) % 360;
  reading.set({ headingRad: (trueDeg * Math.PI) / 180, atMs: now });
}

function startListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('deviceorientation', onOrientation);
}

/**
 * Ask for compass access. MUST be called from a user gesture on iOS the
 * first time. Returns whether the compass is now live.
 */
export async function enableCompass(): Promise<boolean> {
  if (!compassSupported()) return false;
  const ctor = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  try {
    if (typeof ctor.requestPermission === 'function') {
      const result = await ctor.requestPermission();
      if (result !== 'granted') return false;
    }
    granted.set({ ok: true });
    startListening();
    return true;
  } catch {
    return false;
  }
}

/** Re-arm silently on later launches after a previous successful grant. */
export async function resumeCompassIfGranted(): Promise<void> {
  if (!granted.read().ok) return;
  await enableCompass().catch(() => {});
}

const COMPASS_FRESH_MS = 3_000;
// Hysteresis band instead of a hard cliff: compass owns the arrow below
// 1.0 kn, COG owns it above 2.0 kn, and BETWEEN the two the previous
// source keeps steering — a slow boat loitering around the threshold must
// not flap between "where the phone points" and "where we're tracking".
const COMPASS_BELOW_MS = 0.51; // 1.0 kn
const COG_ABOVE_MS = 1.03; // 2.0 kn

export type HeadingSource = 'cog' | 'compass';

// Manual override for the arrow's heading source — the escape hatch when
// the automatic speed-based handoff misbehaves (e.g. SOG not registering
// keeps it stuck in compass mode). Persisted; applied instantly.
export type HeadingMode = 'auto' | 'cog' | 'compass';
const headingMode = defineStore<{ mode: HeadingMode }>('nav.headingSource.v1', 1, {
  mode: 'auto',
});

export function useHeadingMode(): HeadingMode {
  return headingMode.use().mode;
}

export function setHeadingMode(mode: HeadingMode): void {
  headingMode.set({ mode });
}

export interface OwnShipHeading {
  headingRad: number;
  source: HeadingSource;
}

/**
 * Pure arbitration for the own-ship triangle. `prevSource` feeds the
 * hysteresis: inside the 1–2 kn band, whichever source was already
 * steering keeps steering. Fresh-compass and valid-COG requirements always
 * apply; every failure path falls back to the other source, then to null.
 */
export function pickOwnShipHeadingRad(args: {
  cogRad: number | undefined;
  sogMs: number | undefined;
  compass: CompassReading | null;
  nowMs: number;
  prevSource?: HeadingSource;
  /** Manual override; 'auto' (default) = speed-based handoff. */
  mode?: HeadingMode;
}): OwnShipHeading | null {
  const { cogRad, sogMs, compass, nowMs, prevSource, mode = 'auto' } = args;
  const cogValid = isValidCogRad(cogRad);
  const sogValid = isValidSogMs(sogMs);
  const compassFresh = compass != null && nowMs - compass.atMs <= COMPASS_FRESH_MS;

  // Forced source: honor it whenever it's usable; fall back only when it's
  // entirely dead (a frozen arrow is worse than a second-choice one).
  if (mode === 'cog') {
    if (cogValid) return { headingRad: cogRad as number, source: 'cog' };
    if (compassFresh) return { headingRad: compass.headingRad, source: 'compass' };
    return null;
  }
  if (mode === 'compass') {
    if (compassFresh) return { headingRad: compass.headingRad, source: 'compass' };
    if (cogValid) return { headingRad: cogRad as number, source: 'cog' };
    return null;
  }

  let wantCog: boolean;
  if (!sogValid) {
    wantCog = false; // no speed info — trust the phone in your hand
  } else if ((sogMs as number) >= COG_ABOVE_MS) {
    wantCog = true;
  } else if ((sogMs as number) <= COMPASS_BELOW_MS) {
    wantCog = false;
  } else {
    wantCog = prevSource ? prevSource === 'cog' : false; // in-band: no flapping
  }

  if (wantCog && cogValid) return { headingRad: cogRad as number, source: 'cog' };
  if (compassFresh) return { headingRad: compass.headingRad, source: 'compass' };
  if (cogValid) return { headingRad: cogRad as number, source: 'cog' };
  return null;
}
