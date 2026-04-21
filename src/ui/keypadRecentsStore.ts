// Per-field recent-entry store for MarineKeypad. Each field (e.g. "waypoint.label")
// keeps its own FIFO list of the last N committed values, deduped case-insensitively.
// Shown as one-tap chips above the keys so common entries (Pulpit Harbor, Castine)
// are a single press on the next visit — the whole point of the chip row is
// zero-keystroke recall for boats that run the same routes repeatedly.

import { defineStore } from '../storage/localStore';

const MAX_PER_FIELD = 5;

interface Snapshot {
  byField: Record<string, string[]>;
}

const store = defineStore<Snapshot>('nav.keypadRecents.v1', 1, { byField: {} });

export function useKeypadRecents(fieldKey: string): string[] {
  return store.use().byField[fieldKey] ?? [];
}

export function pushKeypadRecent(fieldKey: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  store.update((prev) => {
    const existing = prev.byField[fieldKey] ?? [];
    const deduped = existing.filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...deduped].slice(0, MAX_PER_FIELD);
    return { byField: { ...prev.byField, [fieldKey]: next } };
  });
}
