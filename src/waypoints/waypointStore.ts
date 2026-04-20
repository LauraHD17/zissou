// Saved waypoints — persisted CRUD. Keyed by uuid; ordered as inserted.
// Categories drive the rendered icon; all share the sage --waypoint color.

import { defineStore } from '../storage/localStore';
import type { SavedWaypoint, WaypointCategory } from '../types/nav';

interface Snapshot {
  items: SavedWaypoint[];
}

const store = defineStore<Snapshot>('nav.waypoints.v1', 1, { items: [] });

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
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `wp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    lat: input.lat,
    lon: input.lon,
    label: input.label,
    category: input.category,
    notes: input.notes,
    createdAt: Date.now(),
  };
  store.update((prev) => ({ items: [...prev.items, wp] }));
  return wp;
}

export function updateWaypoint(id: string, patch: Partial<Omit<SavedWaypoint, 'id' | 'createdAt'>>): void {
  store.update((prev) => ({
    items: prev.items.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  }));
}

export function removeWaypoint(id: string): void {
  store.update((prev) => ({ items: prev.items.filter((w) => w.id !== id) }));
}
