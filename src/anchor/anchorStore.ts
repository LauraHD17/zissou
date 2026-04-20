// Active anchor watch session. Ephemeral by design — do NOT persist across
// reloads. A stale anchor on next boot would silently re-arm an alarm at the
// wrong GPS position.

import { defineMemoryStore } from '../storage/localStore';
import type { AnchorWatch } from '../types/nav';

const store = defineMemoryStore<AnchorWatch | null>(null);

export function useAnchorWatch(): AnchorWatch | null {
  return store.use();
}

export function readAnchorWatch(): AnchorWatch | null {
  return store.read();
}

export function dropAnchor(input: Omit<AnchorWatch, 'setAt' | 'alarmAcknowledged'>): void {
  store.set({
    ...input,
    setAt: Date.now(),
    alarmAcknowledged: false,
  });
}

export function clearAnchor(): void {
  store.set(null);
}

export function acknowledgeAnchorAlarm(): void {
  store.update((prev) => (prev ? { ...prev, alarmAcknowledged: true } : prev));
}
