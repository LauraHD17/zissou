// Which vessel's detail panel is open, shared by the AIS list and the chart
// markers. Holds only the vessel's context string — vessels are copy-on-write
// in the ingest store, so the panel host looks up the CURRENT object at
// render time instead of freezing a snapshot at tap time.

import { defineMemoryStore } from '../storage/localStore';

const store = defineMemoryStore<string | null>(null);

export function useSelectedVesselContext(): string | null {
  return store.use();
}

export function selectVessel(context: string): void {
  store.set(context);
}

export function clearVesselSelection(): void {
  store.set(null);
}
