import { useSyncExternalStore } from 'react';
import type { SignalKDelta, Vessel } from './types';
import { createSignalKClient } from './client';
import { createSpeedConsistencyChecker } from './speedConsistency';
import { applyDerivedField, extractMMSI } from './deltaFields';

const SELF_CONTEXT = 'vessels.self';

// Bound the store. A 24/7 kiosk in a trafficked bay must not grow without
// limit, and AIS is an unauthenticated radio broadcast — a flood of unique
// contexts (spoofed or a malfunctioning transponder) must degrade gracefully
// instead of hanging the UI on a Pi 4.
const EVICT_AFTER_MS = 30 * 60 * 1000; // drop targets silent for 30 min
const EVICT_SWEEP_MS = 60 * 1000;
const MAX_TARGETS = 500; // new contexts beyond this are ignored until eviction frees slots
const MAX_PATHS_PER_VESSEL = 64;
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

function ingest(delta: SignalKDelta, opts?: { relayed?: boolean }) {
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

  // The freshest report wins the trust label: a shore-relayed delta marks the
  // vessel relayed; a direct (receiver/server) delta clears it. So when the
  // dAISy hears a boat the internet also reports, direct reception wins.
  next.relayed = opts?.relayed === true;

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
      if (
        Object.hasOwn(next.paths, path) ||
        Object.keys(next.paths).length < MAX_PATHS_PER_VESSEL
      ) {
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
    speedChecker.sample(now, next.position, next.sog);
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

// Same "surface, never guess" policy as the COG warning (deltaFields.ts):
// own-ship SOG is cross-checked against the speed implied by the GPS track,
// and a sustained disagreement (a source emitting knots or km/h on the m/s
// field) is warned once. Speeds stay raw — fix the source's units in SignalK.
const speedChecker = createSpeedConsistencyChecker(({ reportedKn, derivedKn }) => {
  console.warn(
    `SignalK speed-over-ground disagrees with the GPS track: the wire reports ` +
      `~${reportedKn.toFixed(1)} kn but positions imply ~${derivedKn.toFixed(1)} kn. ` +
      `A source is probably emitting the wrong units (spec says m/s). Speed, ETA, ` +
      `and threat readouts are skewed until the source is fixed. Check the SignalK ` +
      `server connection settings.`,
  );
});

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

/**
 * Inject a delta from the supplementary internet-AIS relay (useInternetAis).
 * Same bounded/defensive ingest as the primary client, but the vessel is
 * marked `relayed` so threat banding caps it at 'monitor' and the UI labels
 * it. Deltas only flow while at least one consumer holds the store open —
 * matching the primary client's refcount lifecycle.
 */
export function ingestRelayedDelta(delta: SignalKDelta): void {
  if (refCount === 0) return; // store torn down — drop, like a closed client
  ingest(delta, { relayed: true });
}

// Escape hatch for debugging in devtools.
export function __debugDumpStore() {
  return Array.from(store.entries());
}
