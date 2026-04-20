// MOB session state. Ephemeral — must not persist across reload (we'd be
// announcing an emergency that may have been resolved hours ago).

import { defineMemoryStore } from '../storage/localStore';
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
}

export function clearMOB(): void {
  store.set(null);
}
