// Keeps the local forecast cache warm when the Pi has an internet connection.
// Tries on mount, on significant position change, and every REFRESH_MS.
// Silently fails offline — cached data still displays with an age indicator.

import { useEffect, useRef } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { haversineNm, isPlausiblePosition } from '../utils/geometry';
import { fetchHourlyForecast } from './fetchForecast';
import { readForecastCache, writeForecastCache } from './weatherStore';

const REFRESH_MS = 60 * 60 * 1000; // 1 hr — NWS updates hourly
const REFETCH_ON_MOVE_NM = 5; // only re-hit API after the boat moves ≥ 5 nm

export function useWeatherAutoFetch(): void {
  const self = useSelf();
  const inFlightRef = useRef(false);
  // Coarse (~11 km) position grid — the effect below re-arms only when the
  // boat crosses a 0.1° cell.
  const coarseLat = Math.round((self?.position?.latitude ?? 0) * 10) / 10;
  const coarseLon = Math.round((self?.position?.longitude ?? 0) * 10) / 10;

  useEffect(() => {
    if (!self?.position || !isPlausiblePosition(self.position)) return;
    const pos = self.position;

    const maybeFetch = async () => {
      if (inFlightRef.current) return;
      const cache = readForecastCache();
      const ageMs = Date.now() - cache.lastFetchedAt;
      const moved =
        cache.lastFetchedAt > 0
          ? haversineNm(pos, { latitude: cache.lat, longitude: cache.lon }) >= REFETCH_ON_MOVE_NM
          : true;
      if (cache.lastFetchedAt > 0 && ageMs < REFRESH_MS && !moved) return;

      inFlightRef.current = true;
      try {
        const hourly = await fetchHourlyForecast(pos.latitude, pos.longitude);
        writeForecastCache({
          lastFetchedAt: Date.now(),
          lat: pos.latitude,
          lon: pos.longitude,
          hourly,
        });
      } catch {
        // Offline, API down, or CORS — keep prior cache, try again next tick.
      } finally {
        inFlightRef.current = false;
      }
    };

    const interval = window.setInterval(maybeFetch, REFRESH_MS);
    void maybeFetch();
    return () => window.clearInterval(interval);
    // Re-arm only on coarse (~11 km) position change — crossing a 0.01° grid
    // constantly at anchor shouldn't reset the 1-hr refresh timer. The body's
    // precise self.position is deliberately captured only per re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coarseLat, coarseLon]);
}
