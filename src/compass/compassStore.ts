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
/** Below ~1.5 kn GPS course is noise; the compass is the better pointer. */
const MIN_SOG_FOR_COG_MS = 0.77;

/**
 * Pure arbitration for the own-ship triangle: COG when making way, fresh
 * compass otherwise, COG again as last resort, null when neither exists.
 */
export function pickOwnShipHeadingRad(args: {
  cogRad: number | undefined;
  sogMs: number | undefined;
  compass: CompassReading | null;
  nowMs: number;
}): number | null {
  const { cogRad, sogMs, compass, nowMs } = args;
  const cogValid = isValidCogRad(cogRad);
  const makingWay = cogValid && isValidSogMs(sogMs) && (sogMs as number) >= MIN_SOG_FOR_COG_MS;
  if (makingWay) return cogRad as number;
  if (compass && nowMs - compass.atMs <= COMPASS_FRESH_MS) return compass.headingRad;
  if (cogValid) return cogRad as number;
  return null;
}
