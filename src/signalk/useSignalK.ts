import { useSyncExternalStore } from 'react';
import type { SignalKDelta, Vessel, Position } from './types';
import { createSignalKClient } from './client';

const SELF_CONTEXT = 'vessels.self';

// Bound the store. A 24/7 kiosk in a trafficked bay must not grow without
// limit, and AIS is an unauthenticated radio broadcast — a flood of unique
// contexts (spoofed or a malfunctioning transponder) must degrade gracefully
// instead of hanging the UI on a Pi 4.
const EVICT_AFTER_MS = 30 * 60 * 1000; // drop targets silent for 30 min
const EVICT_SWEEP_MS = 60 * 1000;
const MAX_TARGETS = 500; // new contexts beyond this are ignored until eviction frees slots
const MAX_PATHS_PER_VESSEL = 64;
const MAX_NAME_CHARS = 40; // real AIS names cap at 20; anything longer is garbage
const UNSAFE_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const store: Map<string, Vessel> = new Map();

// Split snapshots with separate listener sets: own-GPS deltas arrive ~1 Hz
// and must not re-render AIS consumers, and a busy harbor's AIS chatter must
// not re-render every own-ship readout.
let selfSnapshot: Vessel | undefined = undefined;
let targetsSnapshot: Vessel[] = [];
const selfListeners = new Set<() => void>();
const targetListeners = new Set<() => void>();

let clientRef: ReturnType<typeof createSignalKClient> | null = null;
let refCount = 0;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function rebuildTargets() {
  targetsSnapshot = Array.from(store.values()).filter((v) => v.context !== SELF_CONTEXT);
}

function notify(listeners: Set<() => void>) {
  listeners.forEach((l) => l());
}

function targetCount(): number {
  return store.size - (store.has(SELF_CONTEXT) ? 1 : 0);
}

function ingest(delta: SignalKDelta) {
  const { context, updates } = delta;
  if (!context || !Array.isArray(updates)) return;

  const prev = store.get(context);
  if (!prev && context !== SELF_CONTEXT && targetCount() >= MAX_TARGETS) return;

  const now = Date.now();
  // Copy-on-write: React consumers (effect deps, memo) rely on a fresh
  // reference whenever a vessel changes. Never mutate a stored vessel.
  const next: Vessel = prev
    ? { ...prev, paths: { ...prev.paths } }
    : { context, mmsi: extractMMSI(context), lastUpdated: 0, paths: {} };

  let touched = false;
  for (const update of updates) {
    if (!Array.isArray(update.values)) continue;
    const parsed = update.timestamp ? Date.parse(update.timestamp) : now;
    // Clamp to local now — a future timestamp from the wire (clock-skewed or
    // spoofed transmitter) must not pin a dead target "fresh" forever.
    const ts = Math.min(Number.isFinite(parsed) ? parsed : now, now);
    next.lastUpdated = Math.max(next.lastUpdated, ts);

    for (const { path, value } of update.values) {
      if (!path || UNSAFE_PATH_KEYS.has(path)) continue;
      if (Object.hasOwn(next.paths, path) || Object.keys(next.paths).length < MAX_PATHS_PER_VESSEL) {
        next.paths[path] = value;
      }
      applyDerivedField(next, path, value);
      touched = true;
    }
  }

  if (!touched) return;
  store.set(context, next);
  if (context === SELF_CONTEXT) {
    selfSnapshot = next;
    notify(selfListeners);
  } else {
    rebuildTargets();
    notify(targetListeners);
  }
}

/** Drop targets that have been silent past the eviction window. */
function sweep() {
  const cutoff = Date.now() - EVICT_AFTER_MS;
  let changed = false;
  for (const [context, v] of store) {
    if (context === SELF_CONTEXT) continue;
    if (v.lastUpdated < cutoff) {
      store.delete(context);
      changed = true;
    }
  }
  if (changed) {
    rebuildTargets();
    notify(targetListeners);
  }
}

function applyDerivedField(v: Vessel, path: string, value: unknown): void {
  switch (path) {
    case 'name':
      if (typeof value === 'string') v.name = value.slice(0, MAX_NAME_CHARS);
      break;
    case 'mmsi':
      if (typeof value === 'string' || typeof value === 'number') v.mmsi = String(value);
      break;
    case 'navigation.position':
      if (isPosition(value)) v.position = value;
      break;
    case 'navigation.speedOverGround':
      if (typeof value === 'number') v.sog = value;
      break;
    case 'navigation.courseOverGroundTrue':
      if (typeof value === 'number') {
        v.cog = value;
        warnIfCogLooksLikeDegrees(value);
      }
      break;
    case 'navigation.state':
      if (typeof value === 'string') v.navState = value;
      break;
  }
}

// SignalK v1 specifies radians for COG, but some plugins emit degrees. There
// is no safe automatic conversion (0–6.28 is valid in both units), so out-of-
// range values are simply rejected by isValidCogRad at the consumers — which
// silently degrades every bearing/threat feature. Surface the misconfiguration
// instead of hiding it.
let degreesLikeCogCount = 0;
let warnedDegreesCog = false;
function warnIfCogLooksLikeDegrees(cog: number) {
  if (cog > Math.PI * 2 && cog <= 360) {
    degreesLikeCogCount++;
    if (degreesLikeCogCount >= 10 && !warnedDegreesCog) {
      warnedDegreesCog = true;
      console.warn(
        'SignalK COG repeatedly exceeds 2π — a source is probably emitting DEGREES ' +
          '(spec says radians). Headings and threat banding are degraded until the ' +
          'source is fixed. Check the SignalK server connection settings.',
      );
    }
  }
}

function isPosition(v: unknown): v is Position {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Position).latitude === 'number' &&
    typeof (v as Position).longitude === 'number'
  );
}

function extractMMSI(context: string): string | undefined {
  // Format: vessels.urn:mrn:imo:mmsi:367123456
  const match = context.match(/mmsi:(\d+)/);
  return match?.[1];
}

function ensureClient() {
  if (!clientRef) {
    clientRef = createSignalKClient();
    clientRef.subscribe(ingest);
    sweepTimer = setInterval(sweep, EVICT_SWEEP_MS);
  }
}

function releaseClient() {
  if (refCount === 0 && clientRef) {
    clientRef.close();
    clientRef = null;
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    store.clear();
    selfSnapshot = undefined;
    targetsSnapshot = [];
  }
}

function makeSubscribe(listeners: Set<() => void>) {
  return (listener: () => void) => {
    refCount++;
    ensureClient();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      refCount--;
      // Defer teardown so rapid mount/unmount cycles don't thrash the connection.
      setTimeout(releaseClient, 0);
    };
  };
}

const subscribeSelf = makeSubscribe(selfListeners);
const subscribeTargets = makeSubscribe(targetListeners);

export function useSelf(): Vessel | undefined {
  return useSyncExternalStore(subscribeSelf, () => selfSnapshot);
}

export function useAISTargets(): Vessel[] {
  return useSyncExternalStore(subscribeTargets, () => targetsSnapshot);
}

// Escape hatch for debugging in devtools.
export function __debugDumpStore() {
  return Array.from(store.entries());
}
