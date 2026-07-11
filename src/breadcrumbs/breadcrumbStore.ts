// Persisted track of own-ship positions (breadcrumbs). Downsampled on the
// write path so the file stays small on long passages: new points record
// only if enough time OR distance has passed since the previous one.
//
// Schema v1: flat array of { lat, lon, t, sog } capped at MAX_POINTS.
// Sliding window — oldest points drop off when full. A personal cruising
// track for the current + recent trips; not a forever archive.

import { defineStore } from '../storage/localStore';

export interface Breadcrumb {
  lat: number;
  lon: number;
  /** Unix ms */
  t: number;
  /** Speed over ground at this point, m/s. Stored so the dwell detector
   *  can use speed (not just position) to decide "stopped". */
  sogMs?: number;
}

interface Snapshot {
  items: Breadcrumb[];
}

const MAX_POINTS = 5000; // ~42 hours at 30s sample cadence
const PERSIST_DEBOUNCE_MS = 5 * 60_000; // batch SD-card writes; flush on page hide

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const store = defineStore<Snapshot>(
  'nav.breadcrumbs.v1',
  1,
  { items: [] },
  {
    persistDebounceMs: PERSIST_DEBOUNCE_MS,
    // Drop corrupted points instead of crashing the track renderer.
    sanitize: (value) => {
      const items = (value as Snapshot | undefined)?.items;
      if (!Array.isArray(items)) return null;
      return {
        items: items.filter(
          (p): p is Breadcrumb =>
            typeof p === 'object' &&
            p !== null &&
            isFiniteNum(p.lat) &&
            Math.abs(p.lat) <= 90 &&
            isFiniteNum(p.lon) &&
            Math.abs(p.lon) <= 180 &&
            isFiniteNum(p.t),
        ),
      };
    },
  },
);

export function useBreadcrumbs(): Breadcrumb[] {
  return store.use().items;
}

export function readBreadcrumbs(): Breadcrumb[] {
  return store.read().items;
}

export function appendBreadcrumb(point: Breadcrumb): void {
  store.update((prev) => {
    const next = [...prev.items, point];
    if (next.length > MAX_POINTS) next.splice(0, next.length - MAX_POINTS);
    return { items: next };
  });
}

export function clearBreadcrumbs(): void {
  store.set({ items: [] });
}
