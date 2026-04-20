// Generic versioned localStorage store with React subscription via
// useSyncExternalStore. Mirrors the module-singleton pattern from
// src/signalk/useSignalK.ts so the codebase has one persistence convention.
//
// Each call to defineStore creates ONE store keyed by `localStorageKey`. The
// returned hook subscribes the component to changes; setters write through
// to localStorage atomically. Schema corruption (parse error, version drift)
// resets to `initial` rather than crashing — the operator can rebuild
// waypoints faster than they can debug a JSON syntax error at sea.

import { useSyncExternalStore } from 'react';

interface Envelope<T> {
  version: number;
  value: T;
}

export interface Store<T> {
  /** React hook subscribing to current value. */
  use: () => T;
  /** Read snapshot outside React (e.g. inside event handlers). */
  read: () => T;
  /** Replace value entirely; persists to localStorage; notifies subscribers. */
  set: (next: T) => void;
  /** Apply a transform; convenience over read+set. */
  update: (fn: (prev: T) => T) => void;
}

/**
 * In-memory cross-component store with the same React subscription interface.
 * For state that should NOT survive page reload (active alarm, anchor-watch
 * session, MOB session, active Go-To destination — see plan §"What is NOT
 * persisted"). Same useSyncExternalStore pattern, no localStorage.
 */
export function defineMemoryStore<T>(initial: T): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();

  const set = (next: T) => {
    if (Object.is(next, current)) return;
    current = next;
    listeners.forEach((l) => l());
  };

  return {
    use: () =>
      useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => current,
      ),
    read: () => current,
    set,
    update: (fn) => set(fn(current)),
  };
}

export function defineStore<T>(
  localStorageKey: string,
  version: number,
  initial: T,
): Store<T> {
  let current = load<T>(localStorageKey, version, initial);
  const listeners = new Set<() => void>();

  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const getSnapshot = () => current;

  const set = (next: T) => {
    if (Object.is(next, current)) return;
    current = next;
    persist(localStorageKey, version, next);
    listeners.forEach((l) => l());
  };

  return {
    use: () => useSyncExternalStore(subscribe, getSnapshot),
    read: () => current,
    set,
    update: (fn) => set(fn(current)),
  };
}

function load<T>(key: string, version: number, initial: T): T {
  if (typeof localStorage === 'undefined') return initial; // SSR / test env
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initial;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.version !== version) return initial; // schema drift → reset
    return env.value;
  } catch {
    return initial;
  }
}

function persist<T>(key: string, version: number, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const env: Envelope<T> = { version, value };
    localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Quota exceeded or storage disabled — silent. Not worth crashing the UI
    // over a failed waypoint save; the in-memory value still works.
  }
}
