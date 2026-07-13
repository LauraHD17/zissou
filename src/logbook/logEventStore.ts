// Persisted, append-only log of notable actions (MOB, anchor set/clear,
// waypoint saves) for the ship's log. The MOB and anchor session stores are
// deliberately ephemeral — this is the durable trace that survives reload,
// recorded at the action sites going forward. Never read by any alarm logic.

import { defineStore } from '../storage/localStore';

export type LogEventKind = 'mob' | 'anchor-set' | 'anchor-clear' | 'waypoint-saved';

export interface LogEvent {
  kind: LogEventKind;
  /** Unix ms. */
  t: number;
  lat?: number;
  lon?: number;
  /** Waypoint label for 'waypoint-saved'. */
  label?: string;
}

interface Snapshot {
  items: LogEvent[];
}

const MAX_EVENTS = 200;
const KINDS: readonly string[] = ['mob', 'anchor-set', 'anchor-clear', 'waypoint-saved'];

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const store = defineStore<Snapshot>(
  'nav.logEvents.v1',
  1,
  { items: [] },
  {
    sanitize: (value) => {
      const items = (value as Snapshot | undefined)?.items;
      if (!Array.isArray(items)) return null;
      return {
        items: items.filter(
          (e): e is LogEvent =>
            typeof e === 'object' &&
            e !== null &&
            KINDS.includes((e as LogEvent).kind) &&
            isFiniteNum((e as LogEvent).t),
        ),
      };
    },
  },
);

export function useLogEvents(): LogEvent[] {
  return store.use().items;
}

export function readLogEvents(): LogEvent[] {
  return store.read().items;
}

export function appendLogEvent(event: LogEvent): void {
  store.update((prev) => {
    const next = [...prev.items, event];
    if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
    return { items: next };
  });
}
