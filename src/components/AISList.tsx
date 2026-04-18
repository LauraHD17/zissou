import { useEffect, useMemo, useState } from 'react';
import type { Vessel } from '../signalk/types';
import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { buildVesselNarrative, haversineNm, isPlausiblePosition } from '../utils/formatters';

const STALE_MS = 5 * 60 * 1000;

export function AISList() {
  const targets = useAISTargets();
  const self = useSelf();
  const now = useNow(5000);

  const rows = useMemo(() => {
    const selfPos = self?.position;
    return targets
      .map((v) => ({
        vessel: v,
        distanceNm:
          selfPos && isPlausiblePosition(v.position) && v.position
            ? haversineNm(selfPos, v.position)
            : null,
        narrative: buildVesselNarrative(v, self, now),
        isStale: now - v.lastUpdated > STALE_MS,
      }))
      .sort((a, b) => {
        if (a.distanceNm == null && b.distanceNm == null) return 0;
        if (a.distanceNm == null) return 1;
        if (b.distanceNm == null) return -1;
        return a.distanceNm - b.distanceNm;
      });
  }, [targets, self, now]);

  if (rows.length === 0) {
    return <div className="ais-empty">No AIS targets yet — waiting for data…</div>;
  }

  return (
    <ul className="ais-list">
      {rows.map(({ vessel, narrative, isStale }) => (
        <li key={vessel.context} className={`ais-row${isStale ? ' ais-row--stale' : ''}`}>
          <div className="ais-row__name">{displayName(vessel)}</div>
          <div className="ais-row__summary">{narrative.summary}</div>
          {narrative.qualifier && (
            <div className="ais-row__qualifier">{narrative.qualifier}</div>
          )}
          <div className="ais-row__raw">{narrative.rawFacts}</div>
        </li>
      ))}
    </ul>
  );
}

function displayName(v: Vessel): string {
  if (v.name) return v.name;
  if (v.mmsi) return `Unnamed vessel (MMSI ${v.mmsi})`;
  return 'Unknown vessel';
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

