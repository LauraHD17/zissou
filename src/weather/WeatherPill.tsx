// "Can I go?" overlay. Brutalist variant:
//   • 8×8 hard-square staleness indicator inline with the headline
//   • Raw clock time for "last fetch" (not "45 min ago")
//   • Stacked `WIND ONLY` tag when wave data is absent — state, not toast

import { useMemo } from 'react';
import { FORECAST_STALE_MS, FORECAST_AGE_SHOW_AFTER_MS, useForecastCache } from './weatherStore';
import { assessWindow } from './canIGo';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { useNow, formatLocalTime } from '../utils/clock';
import { dismiss, useIsDismissed } from '../ui/dismissStore';
import { DismissButton } from '../ui/DismissButton';

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

  const dismissKey = `weather:${cache.lastFetchedAt}`;
  const dismissed = useIsDismissed(dismissKey);
  if (cache.lastFetchedAt === 0 || dismissed) return null;

  const ageMs = now.getTime() - cache.lastFetchedAt;
  const stale = ageMs > FORECAST_STALE_MS;
  const aging = !stale && ageMs > FORECAST_AGE_SHOW_AFTER_MS;
  const showAge = aging || stale;

  // Staleness dot class: green when fresh, amber when aging, red when stale.
  const dotClass = stale
    ? 'weather-pill__dot weather-pill__dot--stale'
    : aging
      ? 'weather-pill__dot weather-pill__dot--aging'
      : 'weather-pill__dot weather-pill__dot--fresh';

  return (
    <div
      className={`weather-pill weather-pill--${assessment.verdict}${stale ? ' weather-pill--stale' : ''}`}
      role="status"
      aria-label={`Weather: ${assessment.summary}${stale ? ' Forecast is stale.' : ''}`}
    >
      <DismissButton onClick={() => dismiss(dismissKey)} label="Hide weather forecast" />
      <span className="weather-pill__primary">
        <span
          className={dotClass}
          aria-hidden="true"
          data-state={stale ? 'stale' : aging ? 'aging' : 'fresh'}
        />
        {headlineFor(assessment.verdict)} · next 6 hr
      </span>
      <span className="weather-pill__summary">{assessment.summary}</span>
      {showAge && (
        <span className="weather-pill__age">
          {stale ? 'Stale · ' : ''}Last fetch {formatLocalTime(new Date(cache.lastFetchedAt))}
        </span>
      )}
    </div>
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
