// Active Go-To destination — single value, ephemeral (resets on reload).
// When cleared / replaced, the previous destination flows into recents.

import { defineMemoryStore } from '../storage/localStore';
import type { Destination } from '../types/nav';
import { pushRecent } from './recentsStore';

const store = defineMemoryStore<Destination | null>(null);

export function useActiveDestination(): Destination | null {
  return store.use();
}

export function readDestination(): Destination | null {
  return store.read();
}

export function setDestination(next: Destination): void {
  const prev = store.read();
  if (prev) pushRecent({ position: prev.position, label: prev.label, setAt: prev.setAt });
  store.set(next);
}

export function clearDestination(): void {
  const prev = store.read();
  if (prev) pushRecent({ position: prev.position, label: prev.label, setAt: prev.setAt });
  store.set(null);
}
