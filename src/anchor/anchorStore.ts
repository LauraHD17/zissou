// Active anchor watch session. Ephemeral by design — do NOT persist across
// reloads. A stale anchor on next boot would silently re-arm an alarm at the
// wrong GPS position.

import { defineMemoryStore } from '../storage/localStore';
import { appendLogEvent } from '../logbook/logEventStore';
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
  // Durable ship's-log trace — the session store itself is wiped on reload.
  appendLogEvent({
    kind: 'anchor-set',
    t: Date.now(),
    lat: input.drop.latitude,
    lon: input.drop.longitude,
  });
}

export function clearAnchor(): void {
  const wasActive = store.read() != null;
  store.set(null);
  if (wasActive) appendLogEvent({ kind: 'anchor-clear', t: Date.now() });
}

export function acknowledgeAnchorAlarm(): void {
  store.update((prev) => (prev ? { ...prev, alarmAcknowledged: true } : prev));
}
