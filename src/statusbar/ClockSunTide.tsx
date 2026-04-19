import { useMemo } from 'react';
import { formatLocalTime, useNow } from '../utils/clock';
import { nextSunEvent } from '../utils/sun';
import { nextTideEvent } from '../utils/tides';

interface Props {
  pos: { latitude: number; longitude: number };
}

export function ClockSunTide({ pos }: Props) {
  const now = useNow(60_000);
  const sun = useMemo(() => nextSunEvent(now, pos), [now, pos.latitude, pos.longitude]);
  const tide = useMemo(() => nextTideEvent(now, pos), [now, pos.latitude, pos.longitude]);

  return (
    <div className="statusbar__almanac">
      <span className="statusbar__time">{formatLocalTime(now)}</span>
      <span className="statusbar__sep" aria-hidden="true">·</span>
      {sun && (
        <>
          <span className="statusbar__sun">
            <span className="statusbar__glyph" aria-hidden="true">
              {sun.kind === 'sunrise' ? '☀↗' : '☀↘'}
            </span>
            <span className="sr-only">{sun.kind === 'sunrise' ? 'Sunrise' : 'Sunset'} at </span>
            {formatLocalTime(sun.time)}
          </span>
          <span className="statusbar__sep" aria-hidden="true">·</span>
        </>
      )}
      <span className="statusbar__tide">
        <span className="statusbar__glyph" aria-hidden="true">
          {tide.direction === 'rising' ? '〰↗' : '〰↘'}
        </span>
        <span className="sr-only">
          {tide.direction === 'rising' ? 'Tide rising, next high at ' : 'Tide falling, next low at '}
        </span>
        {tide.kind === 'high' ? 'High' : 'Low'} {formatLocalTime(tide.time)}
      </span>
    </div>
  );
}
