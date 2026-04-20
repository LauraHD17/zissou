// Persisted marine forecast cache. Fetched from the NWS API when online;
// read from cache otherwise. A forecast older than STALE_MS is still
// shown but marked stale in the UI so the operator doesn't trust it blindly.

import { defineStore } from '../storage/localStore';

export interface HourlyForecastEntry {
  /** Unix ms */
  t: number;
  /** Wind speed, knots. */
  windKn?: number;
  /** Wind direction, degrees (from). */
  windDeg?: number;
  /** Short summary, "Mostly Sunny" / "Thunderstorms". */
  shortDescription?: string;
  /** Air temp, °F. */
  tempF?: number;
}

export interface ForecastCache {
  /** Unix ms the forecast was retrieved. 0 = never fetched. */
  lastFetchedAt: number;
  /** Lat/lon the forecast was fetched for. We re-fetch if the boat moves
   *  far enough to invalidate the grid point. */
  lat: number;
  lon: number;
  hourly: HourlyForecastEntry[];
}

const INITIAL: ForecastCache = { lastFetchedAt: 0, lat: 0, lon: 0, hourly: [] };

const store = defineStore<ForecastCache>('nav.weather.v1', 1, INITIAL);

export function useForecastCache(): ForecastCache {
  return store.use();
}

export function readForecastCache(): ForecastCache {
  return store.read();
}

export function writeForecastCache(c: ForecastCache): void {
  store.set(c);
}

export const FORECAST_STALE_MS = 6 * 60 * 60 * 1000; // 6 hr
export const FORECAST_AGE_SHOW_AFTER_MS = 60 * 60 * 1000; // 1 hr
