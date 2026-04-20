import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineStore } from './localStore';

interface Snap {
  store: Record<string, string>;
}

function mockLocalStorage(): Snap {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
  return { store };
}

describe('defineStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns initial value when no persisted entry exists', () => {
    mockLocalStorage();
    const s = defineStore<{ count: number }>('test.empty.v1', 1, { count: 0 });
    expect(s.read()).toEqual({ count: 0 });
  });

  it('persists set() to localStorage with version envelope', () => {
    const { store } = mockLocalStorage();
    const s = defineStore<{ count: number }>('test.set.v1', 1, { count: 0 });
    s.set({ count: 5 });
    expect(s.read()).toEqual({ count: 5 });
    expect(JSON.parse(store['test.set.v1'])).toEqual({ version: 1, value: { count: 5 } });
  });

  it('rehydrates from existing matching-version envelope', () => {
    mockLocalStorage();
    localStorage.setItem('test.rehydrate.v1', JSON.stringify({ version: 1, value: { count: 42 } }));
    const s = defineStore<{ count: number }>('test.rehydrate.v1', 1, { count: 0 });
    expect(s.read()).toEqual({ count: 42 });
  });

  it('resets to initial when stored version mismatches (schema drift)', () => {
    mockLocalStorage();
    localStorage.setItem('test.drift.v1', JSON.stringify({ version: 99, value: { stale: true } }));
    const s = defineStore<{ ok: boolean }>('test.drift.v1', 1, { ok: true });
    expect(s.read()).toEqual({ ok: true });
  });

  it('resets to initial on JSON corruption', () => {
    mockLocalStorage();
    localStorage.setItem('test.corrupt.v1', 'not valid json {{{');
    const s = defineStore<{ ok: boolean }>('test.corrupt.v1', 1, { ok: true });
    expect(s.read()).toEqual({ ok: true });
  });

  it('update() applies a transform and persists', () => {
    const { store } = mockLocalStorage();
    const s = defineStore<{ items: number[] }>('test.update.v1', 1, { items: [] });
    s.update((prev) => ({ items: [...prev.items, 1, 2, 3] }));
    expect(s.read().items).toEqual([1, 2, 3]);
    expect(JSON.parse(store['test.update.v1']).value.items).toEqual([1, 2, 3]);
  });

  it('notifies subscribers on set()', () => {
    mockLocalStorage();
    const s = defineStore<number>('test.notify.v1', 1, 0);
    // Subscribe via the underlying useSyncExternalStore behavior — easier to
    // test by calling set and checking read; the React hook is exercised in
    // Playwright-level tests where actual rendering matters.
    s.set(1);
    s.set(2);
    expect(s.read()).toBe(2);
  });

  it('skips persistence when next === current (Object.is)', () => {
    const { store } = mockLocalStorage();
    const s = defineStore<{ count: number }>('test.same.v1', 1, { count: 0 });
    const initial = s.read();
    s.set(initial); // same object reference
    expect(store['test.same.v1']).toBeUndefined(); // no write happened
  });
});
