// Tide prediction.
//
// Data flows in this order on first call:
//   1. IndexedDB (key `tides-v1`) — refreshed in the background by
//      useTideRefresh when the Pi sees a tether and the bundled file looks
//      stale. If both IDB and the bundle are present, the freshest wins.
//   2. Bundled `/tides/<year>.json` — written by scripts/fetch-tide-predictions.mjs
//      from NOAA's public API and committed to the repo. The Pi runs from
//      this copy alone; it never needs to reach NOAA at runtime.
//   3. M2 stub — a single-constituent sine wave used only when neither of
//      the above is available (fresh clone before the script runs, or
//      browser-with-no-IDB-and-no-network in dev). All three reader
//      functions flip `isEstimate=true` in this case so the UI can mark
//      the tide pill as approximate.
//
// Real predictions come as discrete high/low events at NOAA's published
// times. tideHeightFt cosine-interpolates between bracketing events — flat
// at the turns, steepest at the midpoint — which matches how harmonic
// tide actually behaves locally between stationary points.

import type { Position } from '../signalk/types';

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

interface PreparedStation extends StationData {
  /** Event times pre-converted to ms epoch and sorted ascending. */
  ts: number[];
  hs: number[];
  kinds: ('H' | 'L')[];
}

interface PreparedPayload {
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
      const r = await fetch(`/tides/${year}.json`);
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
 *  refresh hook to decide whether to attempt a NOAA call. */
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

const FALLBACK_STATION = { lat: 44.3867, lon: -68.7967 }; // Castine, mid-bay

function distSq(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dx = a.lat - b.lat;
  // A degree of longitude shrinks with latitude (~0.72× at 44°N); without
  // this correction east-west distances are overweighted and the wrong
  // station can win by tens of nm.
  const dy = (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180);
  return dx * dx + dy * dy;
}

export function nearestStation(pos: Position | undefined): PreparedStation | null {
  const data = cache;
  if (!data || data.stations.length === 0) return null;
  const target = pos
    ? { lat: pos.latitude, lon: pos.longitude }
    : FALLBACK_STATION;
  let best = data.stations[0];
  let bestD = distSq(target, best);
  for (let i = 1; i < data.stations.length; i++) {
    const d = distSq(target, data.stations[i]);
    if (d < bestD) {
      bestD = d;
      best = data.stations[i];
    }
  }
  return best;
}

/** Bracketing event indices for `nowMs`: returns [i0, i1] such that
 *  ts[i0] <= nowMs < ts[i1], or null if `nowMs` is outside the data range. */
function bracket(station: PreparedStation, nowMs: number): [number, number] | null {
  const ts = station.ts;
  if (ts.length < 2) return null;
  if (nowMs < ts[0] || nowMs >= ts[ts.length - 1]) return null;
  // Binary search for the first index with ts[i] > nowMs.
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ts[mid] <= nowMs) lo = mid + 1;
    else hi = mid;
  }
  return [lo - 1, lo];
}

// --- M2 stub fallback -------------------------------------------------

const M2_PERIOD_MS = 12.42 * 60 * 60 * 1000;
const HALF_PERIOD_MS = M2_PERIOD_MS / 2;
const REF_HIGH = new Date('2026-04-19T03:00:00').getTime();
const M2_AMPLITUDE_FT = 5;

function stubNextEvent(now: Date): TideEvent {
  const elapsed = now.getTime() - REF_HIGH;
  const cycles = elapsed / M2_PERIOD_MS;
  const cycleFloor = Math.floor(cycles);
  const phase = cycles - cycleFloor;
  if (phase < 0.5) {
    const t = REF_HIGH + cycleFloor * M2_PERIOD_MS + HALF_PERIOD_MS;
    return { kind: 'low', time: new Date(t), direction: 'falling', isEstimate: true };
  }
  const t = REF_HIGH + (cycleFloor + 1) * M2_PERIOD_MS;
  return { kind: 'high', time: new Date(t), direction: 'rising', isEstimate: true };
}

function stubHeightFt(now: Date): number {
  const elapsed = now.getTime() - REF_HIGH;
  const phase = (elapsed / M2_PERIOD_MS) * 2 * Math.PI;
  return M2_AMPLITUDE_FT * (1 + Math.cos(phase));
}

// --- Public API -------------------------------------------------------

export function nextTideEvent(now: Date, pos?: Position): TideEvent {
  const station = nearestStation(pos);
  const data = cache;
  if (!station || !data) return stubNextEvent(now);

  const nowMs = now.getTime();
  // Find first event strictly after now.
  const ts = station.ts;
  let i = -1;
  for (let k = 0; k < ts.length; k++) {
    if (ts[k] > nowMs) {
      i = k;
      break;
    }
  }
  if (i < 0) return stubNextEvent(now); // past end of dataset

  const isEstimate = nowMs < data.validFromMs || nowMs > data.validToMs;
  return {
    kind: station.kinds[i] === 'H' ? 'high' : 'low',
    time: new Date(ts[i]),
    direction: station.kinds[i] === 'H' ? 'rising' : 'falling',
    isEstimate,
  };
}

export interface TideHeightReading {
  /** Height relative to MLLW, feet. */
  heightFt: number;
  /** True when the number came from the M2 stub or `now` is outside the
   *  loaded prediction window. Estimated heights can be off by several feet —
   *  grounding-relevant consumers must downgrade or suppress, never present
   *  an estimate as an authoritative depth. */
  isEstimate: boolean;
}

/** Tide height with source quality. Cosine-interpolates between the
 *  bracketing NOAA hi/lo events; falls back to the M2 stub (flagged) when
 *  data is unavailable or `now` lies outside the loaded window. */
export function tideHeightNow(now: Date, pos?: Position): TideHeightReading {
  const station = nearestStation(pos);
  const data = cache;
  if (!station || !data) return { heightFt: stubHeightFt(now), isEstimate: true };
  const nowMs = now.getTime();
  const br = bracket(station, nowMs);
  if (!br) return { heightFt: stubHeightFt(now), isEstimate: true };
  const [i0, i1] = br;
  const t0 = station.ts[i0];
  const t1 = station.ts[i1];
  const h0 = station.hs[i0];
  const h1 = station.hs[i1];
  const tau = (nowMs - t0) / (t1 - t0);
  return {
    heightFt: h0 + ((h1 - h0) * (1 - Math.cos(Math.PI * tau))) / 2,
    isEstimate: nowMs < data.validFromMs || nowMs > data.validToMs,
  };
}

/** Bare-number convenience over tideHeightNow. Prefer tideHeightNow anywhere
 *  the answer feeds depth/grounding decisions — this drops the quality flag. */
export function tideHeightFt(now: Date, pos?: Position): number {
  return tideHeightNow(now, pos).heightFt;
}

/** Direction + rate of change. Direction uses a short ±5 min central
 *  difference — a forward 1-hour difference flips sign up to ~30 min before
 *  each turn. Rate is still the coarse next-hour average. Not currently
 *  consumed by the UI (the pill uses nextTideEvent.direction); kept for
 *  future instrument use. */
export function tideTrend(
  now: Date,
  pos?: Position,
): { direction: 'rising' | 'falling'; rateFtPerHr: number } {
  const EPS_MS = 5 * 60 * 1000;
  const before = tideHeightFt(new Date(now.getTime() - EPS_MS), pos);
  const after = tideHeightFt(new Date(now.getTime() + EPS_MS), pos);
  const curr = tideHeightFt(now, pos);
  const later = tideHeightFt(new Date(now.getTime() + 60 * 60 * 1000), pos);
  return { direction: after >= before ? 'rising' : 'falling', rateFtPerHr: Math.abs(later - curr) };
}

/** True when NOAA predictions authoritatively cover the whole [from, to]
 *  span at this position. Events are continuous, so checking both endpoints
 *  suffices. Window-scanning safety checks (drying alarm, passage windows)
 *  should bail to a "tide unknown" state when this is false rather than
 *  alarm — or stay quiet — on stub numbers. */
export function tidesAuthoritative(from: Date, to: Date, pos?: Position): boolean {
  return !tideHeightNow(from, pos).isEstimate && !tideHeightNow(to, pos).isEstimate;
}

/** UI helper: which station is the app currently using for `pos`? Returns
 *  null when only the stub is available so the caller can hide the label. */
export function currentTideStationName(pos?: Position): string | null {
  const station = nearestStation(pos);
  return station ? station.name : null;
}
