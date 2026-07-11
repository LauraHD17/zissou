// Background refresh of NOAA tide predictions on the Pi.
//
// On mount, decide whether the loaded data is "getting stale" (validTo near,
// or fetched many months ago). If so AND we appear to be online, hit NOAA
// directly — their public datagetter API sends CORS headers, so a browser
// fetch from the Pi works without a proxy.
//
// On success, persist to IndexedDB and update the in-memory cache. On any
// failure (offline, NOAA down, CORS hiccup) the bundled copy keeps working
// untouched. There's no UI for this hook — the existing tide pill already
// dims and prefixes with `~` whenever the data is unavailable or out of
// window, which is the only signal the operator needs.

import { useEffect } from 'react';
import {
  loadTides,
  readLoadedTides,
  writeTidesToIdb,
  type TidePayload,
} from './tides';

interface StationDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const FALLBACK_STATIONS: StationDef[] = [
  { id: '8413320', name: 'Bar Harbor', lat: 44.3922, lon: -68.2043 },
  { id: '8414672', name: 'Castine', lat: 44.3867, lon: -68.7967 },
  { id: '8415490', name: 'Rockland', lat: 44.105, lon: -69.1017 },
];

const NOAA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

// Refresh decision thresholds. validTo within this window → fetch a longer
// horizon. Last fetch older than this → fetch even if still inside window
// (in case NOAA corrects predictions mid-year).
const STALE_VALID_TO_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_FETCHED_AT_MS = 90 * 24 * 60 * 60 * 1000;

// Probe is a tiny 1-day request; cheap to fail.
const PROBE_TIMEOUT_MS = 8000;
const FULL_TIMEOUT_MS = 30000;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}${pad(m)}${pad(d)}`;
}

function toIso(s: string): string {
  return `${s.replace(' ', 'T')}:00Z`;
}

interface NoaaPrediction {
  t: string;
  v: string;
  type: 'H' | 'L';
}

async function noaaFetch(
  station: string,
  beginYmd: string,
  endYmd: string,
  signal: AbortSignal,
): Promise<NoaaPrediction[]> {
  const url = new URL(NOAA);
  url.searchParams.set('product', 'predictions');
  url.searchParams.set('interval', 'hilo');
  url.searchParams.set('datum', 'MLLW');
  url.searchParams.set('units', 'english');
  url.searchParams.set('time_zone', 'gmt');
  url.searchParams.set('format', 'json');
  url.searchParams.set('application', 'navigation-project');
  url.searchParams.set('station', station);
  url.searchParams.set('begin_date', beginYmd);
  url.searchParams.set('end_date', endYmd);
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json: { predictions?: NoaaPrediction[]; error?: { message: string } } = await r.json();
  if (json.error) throw new Error(json.error.message);
  if (!Array.isArray(json.predictions)) throw new Error('no predictions');
  return json.predictions;
}

function withTimeout<T>(p: Promise<T>, ms: number, ctl: AbortController): Promise<T> {
  const timer = window.setTimeout(() => ctl.abort(), ms);
  return p.finally(() => window.clearTimeout(timer));
}

function shouldRefresh(): boolean {
  const data = readLoadedTides();
  if (!data) return true; // nothing loaded — anything we can fetch is an upgrade
  const now = Date.now();
  if (data.validToMs - now < STALE_VALID_TO_MS) return true;
  if (now - data.fetchedAtMs > STALE_FETCHED_AT_MS) return true;
  return false;
}

function pickStations(): StationDef[] {
  const loaded = readLoadedTides();
  if (loaded && loaded.stations.length > 0) {
    return loaded.stations.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon }));
  }
  return FALLBACK_STATIONS;
}

async function refreshOnce(): Promise<void> {
  if (!('onLine' in navigator) || !navigator.onLine) return;

  const stations = pickStations();
  const startYear = new Date().getUTCFullYear();
  const years = [startYear, startYear + 1];

  // Probe: 1 day for the first station. Cheap; fails fast.
  const probeCtl = new AbortController();
  try {
    const today = new Date();
    const today_ymd = ymd(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
    await withTimeout(
      noaaFetch(stations[0].id, today_ymd, today_ymd, probeCtl.signal),
      PROBE_TIMEOUT_MS,
      probeCtl,
    );
  } catch {
    return; // offline or NOAA unreachable — bundled copy still works
  }

  // Full pull.
  const fullCtl = new AbortController();
  const stationPayloads = [];
  try {
    for (const s of stations) {
      const events = [];
      for (const y of years) {
        const got = await withTimeout(
          noaaFetch(s.id, ymd(y, 1, 1), ymd(y, 12, 31), fullCtl.signal),
          FULL_TIMEOUT_MS,
          fullCtl,
        );
        for (const p of got) {
          // Validate before persisting: a single "n/a" height or garbled
          // time must not put NaN into the stored predictions.
          const heightFt = Number(p.v);
          const t = toIso(p.t);
          if (!Number.isFinite(heightFt) || !Number.isFinite(Date.parse(t))) continue;
          if (p.type !== 'H' && p.type !== 'L') continue;
          events.push({ t, kind: p.type === 'H' ? ('H' as const) : ('L' as const), heightFt });
        }
      }
      // A station with fewer than 2 usable events can't be interpolated.
      if (events.length >= 2) stationPayloads.push({ ...s, events });
    }
  } catch {
    return;
  }
  if (stationPayloads.length === 0) return; // don't overwrite good data with nothing

  const payload: TidePayload = {
    fetchedAt: new Date().toISOString(),
    validFrom: `${startYear}-01-01T00:00:00Z`,
    validTo: `${startYear + years.length - 1}-12-31T23:59:59Z`,
    stations: stationPayloads,
  };

  try {
    await writeTidesToIdb(payload);
  } catch {
    // IDB write failed (quota, private mode). The next reload will re-fetch.
  }
}

// Module-level so StrictMode's double-mount (and any future second consumer)
// can't run two overlapping NOAA pulls.
let inflight = false;

async function checkAndRefresh(): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    await loadTides();
    if (!shouldRefresh()) return;
    await refreshOnce();
  } finally {
    inflight = false;
  }
}

const RECHECK_MS = 24 * 60 * 60 * 1000;

export function useTideRefresh(): void {
  useEffect(() => {
    void checkAndRefresh();
    // A kiosk stays up for months — without a periodic re-check the data
    // would quietly age past validTo and the app would degrade to estimates.
    // shouldRefresh() makes the daily tick a no-op while the data is fresh.
    const id = setInterval(() => void checkAndRefresh(), RECHECK_MS);
    return () => clearInterval(id);
  }, []);
}
