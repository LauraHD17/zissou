// Tide data source + cache layer.
//
// Loads NOAA hi/lo predictions from (freshest wins):
//   1. IndexedDB (key `tides-v1`) — refreshed in the background by
//      useTideRefresh when the Pi sees a tether and the bundle looks stale.
//   2. Bundled `/tides/<year>.json` — committed to the repo; the Pi runs from
//      this copy alone and never reaches NOAA at runtime.
// When neither is available the query layer (tides.ts) falls back to the M2
// stub (tideStub.ts) and flags every reading as an estimate.
//
// This module owns the mutable in-memory `cache` singleton and all browser
// storage/network access; the query + interpolation math lives in tides.ts so
// it stays testable without IDB/fetch mocks.

export type TideKind = 'high' | 'low';

export interface TideEvent {
  kind: TideKind;
  time: Date;
  /** Whether the water is currently rising (toward high) or falling (toward low). */
  direction: 'rising' | 'falling';
  /** True when the tide source is the M2 stub, or when the operator's time
   *  is outside the loaded NOAA prediction window. The UI dims and prefixes
   *  the event with `~` when set. */
  isEstimate: boolean;
}

interface TideEventRaw {
  t: string; // ISO-8601 UTC
  kind: 'H' | 'L';
  heightFt: number;
}

interface StationData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  events: TideEventRaw[];
}

export interface TidePayload {
  fetchedAt: string;
  validFrom: string;
  validTo: string;
  stations: StationData[];
}

export interface PreparedStation extends StationData {
  /** Event times pre-converted to ms epoch and sorted ascending. */
  ts: number[];
  hs: number[];
  kinds: ('H' | 'L')[];
}

export interface PreparedPayload {
  fetchedAtMs: number;
  validFromMs: number;
  validToMs: number;
  stations: PreparedStation[];
}

let cache: PreparedPayload | null = null;
let loadingPromise: Promise<PreparedPayload | null> | null = null;

const IDB_NAME = 'navapp';
const IDB_STORE = 'kv';
const IDB_KEY = 'tides-v1';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readIdb(): Promise<TidePayload | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as TidePayload) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function writeTidesToIdb(payload: TidePayload): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(payload, IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  cache = prepare(payload);
}

async function fetchBundled(): Promise<TidePayload | null> {
  if (typeof fetch === 'undefined') return null;
  // Pull whichever year the operator is in. If the bundle covers multiple
  // years (the script writes a 2-year overlap), it's keyed by the start year,
  // so try current year then previous year as a fallback.
  const now = new Date();
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
    try {
      // BASE_URL-prefixed: the phone build is served from a subpath.
      const r = await fetch(`${import.meta.env.BASE_URL}tides/${year}.json`);
      if (r.ok) return (await r.json()) as TidePayload;
    } catch {
      // network or parse failure — try next year
    }
  }
  return null;
}

function prepare(payload: TidePayload): PreparedPayload {
  // Both NOAA responses and IDB contents are unvalidated JSON. A single
  // malformed event ("n/a" height, garbled time) must not put NaN into the
  // depth math — drop bad events, drop stations left with <2 events.
  const validFromMs = new Date(payload.validFrom).getTime();
  const validToMs = new Date(payload.validTo).getTime();
  return {
    fetchedAtMs: new Date(payload.fetchedAt).getTime(),
    // Non-finite window bounds fail the isEstimate comparisons "open" —
    // an unusable window must read as estimated, never as authoritative.
    validFromMs: Number.isFinite(validFromMs) ? validFromMs : Infinity,
    validToMs: Number.isFinite(validToMs) ? validToMs : -Infinity,
    stations: (Array.isArray(payload.stations) ? payload.stations : [])
      .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon))
      .map((s) => {
        const clean = (Array.isArray(s.events) ? s.events : [])
          .map((e) => ({
            t: new Date(e?.t).getTime(),
            h: Number(e?.heightFt),
            kind: e?.kind,
          }))
          .filter(
            (e): e is { t: number; h: number; kind: 'H' | 'L' } =>
              Number.isFinite(e.t) && Number.isFinite(e.h) && (e.kind === 'H' || e.kind === 'L'),
          )
          .sort((a, b) => a.t - b.t);
        return {
          ...s,
          ts: clean.map((e) => e.t),
          hs: clean.map((e) => e.h),
          kinds: clean.map((e) => e.kind),
        };
      })
      .filter((s) => s.ts.length >= 2),
  };
}

export function loadTides(): Promise<PreparedPayload | null> {
  if (cache) return Promise.resolve(cache);
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const [fromIdb, fromBundle] = await Promise.all([
      readIdb().catch(() => null),
      fetchBundled().catch(() => null),
    ]);
    let chosen: TidePayload | null;
    if (fromIdb && fromBundle) {
      chosen =
        new Date(fromIdb.fetchedAt).getTime() >= new Date(fromBundle.fetchedAt).getTime()
          ? fromIdb
          : fromBundle;
    } else {
      chosen = fromIdb ?? fromBundle ?? null;
    }
    cache = chosen ? prepare(chosen) : null;
    // Total failure (e.g. a transient hiccup at boot before IDB is warm and
    // while the bundle 404s) must not latch — clear the promise so the next
    // caller retries instead of running the whole session on the stub.
    if (!cache) loadingPromise = null;
    return cache;
  })();
  return loadingPromise;
}

/** Returns the snapshot used to back the last sync read. Useful for the
 *  refresh hook to decide whether to attempt a NOAA call, and for the query
 *  layer (tides.ts) to read the current predictions. */
export function readLoadedTides(): PreparedPayload | null {
  return cache;
}

/** Test-only seam: seed the in-memory cache without touching IDB or the
 *  network. Pass `null` to clear and force the M2 stub fallback path. */
export function __setTidesForTests(payload: TidePayload | null): void {
  cache = payload ? prepare(payload) : null;
  loadingPromise = null;
}

// Kick off load eagerly on module import — first sync read may still hit
// the stub fallback if the fetch is mid-flight, but subsequent reads will
// have real data. In tests we also expose loadTides() for awaiting.
loadTides();
