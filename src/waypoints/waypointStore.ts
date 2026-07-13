// Saved waypoints — persisted CRUD. Keyed by uuid; ordered as inserted.
// Categories drive the rendered icon; all share the --waypoint accent
// (yellow-green in day, warm red at night — see the palette in app.css).

import { newId } from '../utils/id';
import { defineStore } from '../storage/localStore';
import { appendLogEvent } from '../logbook/logEventStore';
import type { SavedWaypoint, WaypointCategory } from '../types/nav';

interface Snapshot {
  items: SavedWaypoint[];
}

const store = defineStore<Snapshot>(
  'nav.waypoints.v1',
  1,
  { items: [] },
  {
    // localStorage is untrusted: a tampered/corrupted entry that kept the
    // version number would otherwise reach the chart marker hooks and crash
    // the app. Drop bad entries, keep the rest.
    sanitize: (value) => {
      const items = (value as Snapshot | undefined)?.items;
      if (!Array.isArray(items)) return null;
      return {
        items: items.filter(
          (w): w is SavedWaypoint =>
            typeof w === 'object' &&
            w !== null &&
            typeof w.id === 'string' &&
            typeof w.label === 'string' &&
            typeof w.category === 'string' &&
            typeof w.lat === 'number' &&
            Number.isFinite(w.lat) &&
            Math.abs(w.lat) <= 90 &&
            typeof w.lon === 'number' &&
            Number.isFinite(w.lon) &&
            Math.abs(w.lon) <= 180,
        ),
      };
    },
  },
);

export function useWaypoints(): SavedWaypoint[] {
  return store.use().items;
}

export function readWaypoints(): SavedWaypoint[] {
  return store.read().items;
}

interface AddInput {
  lat: number;
  lon: number;
  label: string;
  category: WaypointCategory;
  notes?: string;
}

export function addWaypoint(input: AddInput): SavedWaypoint {
  const wp: SavedWaypoint = {
    id: newId('wp'),
    lat: input.lat,
    lon: input.lon,
    label: input.label,
    category: input.category,
    notes: input.notes,
    createdAt: Date.now(),
  };
  store.update((prev) => ({ items: [...prev.items, wp] }));
  appendLogEvent({
    kind: 'waypoint-saved',
    t: wp.createdAt,
    lat: wp.lat,
    lon: wp.lon,
    label: wp.label,
  });
  return wp;
}

export function updateWaypoint(
  id: string,
  patch: Partial<Omit<SavedWaypoint, 'id' | 'createdAt'>>,
): void {
  store.update((prev) => ({
    items: prev.items.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  }));
}

export function removeWaypoint(id: string): void {
  store.update((prev) => ({ items: prev.items.filter((w) => w.id !== id) }));
}
