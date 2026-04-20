// Last-10 recent destinations. Persisted. Dedupes by lat/lon rounded to 4
// decimals (~11 m), so re-setting the same Go-To doesn't pollute the list.
// Newest first.

import { defineStore } from '../storage/localStore';
import type { RecentDestination } from '../types/nav';

const MAX = 10;
const ROUND_DECIMALS = 4;

interface Snapshot {
  items: RecentDestination[];
}

const store = defineStore<Snapshot>('nav.recents.v1', 1, { items: [] });

export function useRecents(): RecentDestination[] {
  return store.use().items;
}

export function readRecents(): RecentDestination[] {
  return store.read().items;
}

export function pushRecent(entry: RecentDestination): void {
  store.update((prev) => {
    const dedup = prev.items.filter((e) => !samePosition(e.position, entry.position));
    return { items: [entry, ...dedup].slice(0, MAX) };
  });
}

export function clearRecents(): void {
  store.set({ items: [] });
}

function samePosition(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): boolean {
  return round(a.latitude) === round(b.latitude) && round(a.longitude) === round(b.longitude);
}

function round(n: number): number {
  const f = 10 ** ROUND_DECIMALS;
  return Math.round(n * f) / f;
}
