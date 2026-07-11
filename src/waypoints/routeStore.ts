// Active route — ordered waypoints, ephemeral (resets on reload). The last
// waypoint is the destination; everything before it is an intermediate leg.
//
// Supersedes the single-pin destinationStore. A 1-waypoint route is the same
// thing as the old Go-To destination; multi-pin routes string around
// peninsulas so ETA reflects actual sailed distance, not straight line.
//
// When a route is cleared or replaced, the previous destination (last
// waypoint) flows into recentsStore — same behavior as the old store.

import { newId } from '../utils/id';
import type { Position } from '../signalk/types';
import { defineMemoryStore } from '../storage/localStore';
import type { ActiveRoute, RouteSource, RouteWaypoint } from '../types/nav';
import { pushRecent } from './recentsStore';

const store = defineMemoryStore<ActiveRoute | null>(null);

export function useActiveRoute(): ActiveRoute | null {
  return store.use();
}

export function readRoute(): ActiveRoute | null {
  return store.read();
}

interface AppendInput {
  position: Position;
  label?: string;
  savedId?: string;
  source?: RouteSource;
}

/** Append a waypoint to the current route. If no route is active, starts a
 *  new one. Used by the drop-pin route-build flow (each tap extends). */
export function appendWaypoint(input: AppendInput): void {
  const now = Date.now();
  const wp: RouteWaypoint = {
    id: newId('wp'),
    position: input.position,
    label: input.label,
    savedId: input.savedId,
    setAt: now,
  };
  const prev = store.read();
  if (!prev) {
    store.set({
      waypoints: [wp],
      source: input.source ?? 'drop-pin',
      createdAt: now,
    });
    return;
  }
  store.set({ ...prev, waypoints: [...prev.waypoints, wp] });
}

/** Replace the current route with a single waypoint. Used for "Go to" on a
 *  saved waypoint / recent / MOB / coordinate entry — those intents mean
 *  "take me directly there," not "extend my current route." Pushes the
 *  prior destination (last waypoint) to recents like the old setDestination. */
export function replaceRouteWithSingle(input: AppendInput): void {
  const now = Date.now();
  const prev = store.read();
  if (prev) pushLastToRecents(prev);
  const wp: RouteWaypoint = {
    id: newId('wp'),
    position: input.position,
    label: input.label,
    savedId: input.savedId,
    setAt: now,
  };
  store.set({
    waypoints: [wp],
    source: input.source ?? 'drop-pin',
    createdAt: now,
  });
}

/** Remove a single waypoint by id. If removing leaves zero waypoints, the
 *  whole route is cleared (last waypoint flows to recents). */
export function removeWaypoint(id: string): void {
  const prev = store.read();
  if (!prev) return;
  const remaining = prev.waypoints.filter((w) => w.id !== id);
  if (remaining.length === 0) {
    pushLastToRecents(prev);
    store.set(null);
    return;
  }
  store.set({ ...prev, waypoints: remaining });
}

export function clearRoute(): void {
  const prev = store.read();
  if (prev) pushLastToRecents(prev);
  store.set(null);
}

/** Convenience: the current destination (last waypoint) or null. */
export function readDestinationWaypoint(): RouteWaypoint | null {
  const route = store.read();
  if (!route || route.waypoints.length === 0) return null;
  return route.waypoints[route.waypoints.length - 1];
}

function pushLastToRecents(route: ActiveRoute): void {
  const last = route.waypoints[route.waypoints.length - 1];
  if (!last) return;
  pushRecent({ position: last.position, label: last.label, setAt: last.setAt });
}
