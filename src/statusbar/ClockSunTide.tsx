import { useMemo } from 'react';
import { Icon } from '../icons';
import { formatLocalTime, useNow } from '../utils/clock';
import { nextSunEvent } from '../utils/sun';
import { currentTideStationName, nextTideEvent } from '../utils/tides';

interface Props {
  pos: { latitude: number; longitude: number };
}

export function ClockSunTide({ pos }: Props) {
  const now = useNow(60_000);
  // Granular deps: `pos` is a fresh object literal from StatusBar every
  // render; keying on lat/lon keeps the sun/tide math at 1-min cadence.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sun = useMemo(() => nextSunEvent(now, pos), [now, pos.latitude, pos.longitude]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tide = useMemo(() => nextTideEvent(now, pos), [now, pos.latitude, pos.longitude]);
  const tideStation = useMemo(
    () => currentTideStationName(pos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos.latitude, pos.longitude],
  );

  return (
    <div className="statusbar__almanac">
      <span className="statusbar__time">{formatLocalTime(now)}</span>
      <span className="statusbar__sep" aria-hidden="true">
        ·
      </span>
      {sun && (
        <>
          <span className="statusbar__sun">
            <Icon name={sun.kind === 'sunrise' ? 'sunrise' : 'sunset'} size={20} />
            <span className="sr-only">{sun.kind === 'sunrise' ? 'Sunrise' : 'Sunset'} at </span>
            {formatLocalTime(sun.time)}
          </span>
          <span className="statusbar__sep" aria-hidden="true">
            ·
          </span>
        </>
      )}
      <span
        className={`statusbar__tide${tide.isEstimate ? ' statusbar__tide--estimate' : ''}`}
        title={
          tide.isEstimate
            ? 'Approximate tide — NOAA prediction unavailable for this time'
            : tideStation
              ? `Predictions from NOAA station: ${tideStation}`
              : undefined
        }
      >
        <Icon name={tide.direction === 'rising' ? 'tideRising' : 'tideFalling'} size={20} />
        <span className="sr-only">
          {tide.isEstimate ? 'Estimated ' : ''}
          {tideStation ? `${tideStation}, ` : ''}
          {tide.direction === 'rising'
            ? 'tide rising, next high at '
            : 'tide falling, next low at '}
        </span>
        {/* Station name intentionally NOT rendered visibly — it crowded the
            phone bar. Provenance stays in the tooltip + sr-only text above,
            and Settings shows the active station (decision 2026-07-19). */}
        {tide.kind === 'high' ? 'High' : 'Low'} {formatLocalTime(tide.time)}
      </span>
    </div>
  );
}
