// NWS forecast + "can I go?" verdict for the next 6 hr. Staleness dot is
// green/amber/red based on last-fetch age; text carries the same signal.

import { useMemo } from 'react';
import { FORECAST_STALE_MS, FORECAST_AGE_SHOW_AFTER_MS, useForecastCache } from './weatherStore';
import { assessWindow } from './canIGo';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { useNow, formatLocalTime } from '../utils/clock';
import { OverlayPill } from '../ui/OverlayPill';

const WINDOW_MS = 6 * 60 * 60 * 1000;

export function WeatherPill() {
  const cache = useForecastCache();
  const prefs = useUserPrefs();
  const now = useNow(5 * 60 * 1000);

  const assessment = useMemo(
    () =>
      assessWindow(
        cache.hourly,
        now.getTime(),
        now.getTime() + WINDOW_MS,
        prefs.weatherLimits.maxWindKn,
      ),
    [cache.hourly, now, prefs.weatherLimits.maxWindKn],
  );

  if (cache.lastFetchedAt === 0) return null;

  const ageMs = now.getTime() - cache.lastFetchedAt;
  const stale = ageMs > FORECAST_STALE_MS;
  const aging = !stale && ageMs > FORECAST_AGE_SHOW_AFTER_MS;
  const showAge = aging || stale;
  const dotClass = stale
    ? 'weather-pill__dot weather-pill__dot--stale'
    : aging
      ? 'weather-pill__dot weather-pill__dot--aging'
      : 'weather-pill__dot weather-pill__dot--fresh';

  return (
    <OverlayPill
      className={`weather-pill weather-pill--${assessment.verdict}${stale ? ' weather-pill--stale' : ''}`}
      dismissKey={`weather:${cache.lastFetchedAt}`}
      dismissLabel="Hide weather forecast"
      ariaLabel={`Weather: ${assessment.summary}${stale ? ' Forecast is stale.' : ''}`}
    >
      <span className="weather-pill__primary">
        <span className={dotClass} aria-hidden="true" />
        {headlineFor(assessment.verdict)} · next 6 hr
      </span>
      <span className="weather-pill__summary">{assessment.summary}</span>
      {showAge && (
        <span className="weather-pill__age">
          {stale ? 'Stale · ' : ''}Last fetch {formatLocalTime(new Date(cache.lastFetchedAt))}
        </span>
      )}
    </OverlayPill>
  );
}

function headlineFor(v: 'safe' | 'watch' | 'nogo' | 'unknown'): string {
  switch (v) {
    case 'safe':
      return 'Safe to go';
    case 'watch':
      return 'Watch conditions';
    case 'nogo':
      return 'Stay in port';
    case 'unknown':
      return 'Wind forecast';
  }
}
