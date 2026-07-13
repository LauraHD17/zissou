// MOB session state. Ephemeral — must not persist across reload (we'd be
// announcing an emergency that may have been resolved hours ago).

import { defineMemoryStore } from '../storage/localStore';
import { appendLogEvent } from '../logbook/logEventStore';
import type { Position } from '../signalk/types';

export interface MOBState {
  position: Position;
  activatedAt: number;
}

const store = defineMemoryStore<MOBState | null>(null);

export function useMOB(): MOBState | null {
  return store.use();
}

export function readMOB(): MOBState | null {
  return store.read();
}

export function activateMOB(position: Position): void {
  store.set({ position, activatedAt: Date.now() });
  // Durable ship's-log trace — this store itself is wiped on reload.
  appendLogEvent({ kind: 'mob', t: Date.now(), lat: position.latitude, lon: position.longitude });
}

export function clearMOB(): void {
  store.set(null);
}
