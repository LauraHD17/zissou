import { useSyncExternalStore } from 'react';
import type { SignalKDelta, Vessel, Position } from './types';
import { createSignalKClient } from './client';

type VesselStore = Map<string, Vessel>;

const store: VesselStore = new Map();
const listeners = new Set<() => void>();
let snapshot: Vessel[] = [];
let clientRef: ReturnType<typeof createSignalKClient> | null = null;
let refCount = 0;

function rebuildSnapshot() {
  snapshot = Array.from(store.values());
}

function notify() {
  listeners.forEach((l) => l());
}

function ingest(delta: SignalKDelta) {
  const { context, updates } = delta;
  if (!context || !Array.isArray(updates)) return;

  const existing = store.get(context) ?? {
    context,
    mmsi: extractMMSI(context),
    lastUpdated: 0,
    paths: {},
  };

  let touched = false;
  for (const update of updates) {
    if (!Array.isArray(update.values)) continue;
    const ts = update.timestamp ? Date.parse(update.timestamp) : Date.now();
    existing.lastUpdated = Math.max(existing.lastUpdated, Number.isFinite(ts) ? ts : Date.now());

    for (const { path, value } of update.values) {
      if (!path) continue;
      existing.paths[path] = value;
      applyDerivedField(existing, path, value);
      touched = true;
    }
  }

  if (touched) {
    store.set(context, existing);
    rebuildSnapshot();
    notify();
  }
}

function applyDerivedField(v: Vessel, path: string, value: unknown): void {
  switch (path) {
    case 'name':
      if (typeof value === 'string') v.name = value;
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
      if (typeof value === 'number') v.cog = value;
      break;
    case 'navigation.headingTrue':
      if (typeof value === 'number') v.heading = value;
      break;
    case 'navigation.state':
      if (typeof value === 'string') v.navState = value;
      break;
    case 'design.aisShipType':
      if (value !== null && value !== undefined) v.shipType = value as string | number;
      break;
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
  }
}

function releaseClient() {
  if (refCount === 0 && clientRef) {
    clientRef.close();
    clientRef = null;
    store.clear();
    rebuildSnapshot();
  }
}

function subscribe(listener: () => void) {
  refCount++;
  ensureClient();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    refCount--;
    // Defer teardown so rapid mount/unmount cycles don't thrash the connection.
    setTimeout(releaseClient, 0);
  };
}

function getSnapshot(): Vessel[] {
  return snapshot;
}

export function useVessels(): Vessel[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useSelf(): Vessel | undefined {
  const vessels = useVessels();
  return vessels.find((v) => v.context === 'vessels.self');
}

export function useAISTargets(): Vessel[] {
  const vessels = useVessels();
  return vessels.filter((v) => v.context !== 'vessels.self');
}

// Escape hatch for debugging in devtools.
export function __debugDumpStore() {
  return Array.from(store.entries());
}
