// Session-scoped dismiss state for overlay pills. Keyed so that when the
// underlying state changes (new forecast, new destination), the old
// dismissal stops applying — the pill comes back because it's different
// information now, not the same one they dismissed.

import { defineMemoryStore } from '../storage/localStore';

const store = defineMemoryStore<Record<string, boolean>>({});

export function useIsDismissed(key: string): boolean {
  return store.use()[key] === true;
}

export function dismiss(key: string): void {
  store.update((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
}
