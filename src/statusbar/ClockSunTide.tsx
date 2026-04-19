import { useMemo } from 'react';
import { Icon } from '../icons';
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
            <Icon name={sun.kind === 'sunrise' ? 'sunrise' : 'sunset'} size={16} />
            <span className="sr-only">{sun.kind === 'sunrise' ? 'Sunrise' : 'Sunset'} at </span>
            {formatLocalTime(sun.time)}
          </span>
          <span className="statusbar__sep" aria-hidden="true">·</span>
        </>
      )}
      <span className="statusbar__tide">
        <Icon name={tide.direction === 'rising' ? 'tideRising' : 'tideFalling'} size={16} />
        <span className="sr-only">
          {tide.direction === 'rising' ? 'Tide rising, next high at ' : 'Tide falling, next low at '}
        </span>
        {tide.kind === 'high' ? 'High' : 'Low'} {formatLocalTime(tide.time)}
      </span>
    </div>
  );
}
