import { useMemo } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { formatEventTime, formatLocalTime, useNow } from '../utils/clock';
import { nextSunEvent } from '../utils/sun';
import { nextTideEvent } from '../utils/tides';

// Falls back to Penobscot Bay (mid-coast Maine) for sun/tide compute when
// SignalK has no fix yet. Display still works; updates once GPS is live.
const FALLBACK_POS = { latitude: 44.4, longitude: -68.8 };

export function Almanac() {
  const self = useSelf();
  const now = useNow(60_000);

  const pos = self?.position ?? FALLBACK_POS;

  const sun = useMemo(() => nextSunEvent(now, pos), [now, pos.latitude, pos.longitude]);
  const tide = useMemo(() => nextTideEvent(now, pos), [now, pos.latitude, pos.longitude]);

  return (
    <div className="almanac" aria-label="Local almanac">
      <span className="almanac__time">{formatLocalTime(now)}</span>
      <span className="almanac__sep" aria-hidden="true">·</span>
      {sun && (
        <>
          <span className="almanac__sun">
            <span className="almanac__glyph" aria-hidden="true">
              {sun.kind === 'sunrise' ? '☀↗' : '☀↘'}
            </span>
            <span className="sr-only">{sun.kind === 'sunrise' ? 'Sunrise' : 'Sunset'} at </span>
            {formatEventTime(sun.time)}
          </span>
          <span className="almanac__sep" aria-hidden="true">·</span>
        </>
      )}
      <span className="almanac__tide">
        <span className="almanac__glyph" aria-hidden="true">
          {tide.direction === 'rising' ? '〰↗' : '〰↘'}
        </span>
        <span className="sr-only">
          {tide.direction === 'rising' ? 'Tide rising, next high at ' : 'Tide falling, next low at '}
        </span>
        {tide.kind === 'high' ? 'High' : 'Low'} {formatEventTime(tide.time)}
      </span>
    </div>
  );
}
