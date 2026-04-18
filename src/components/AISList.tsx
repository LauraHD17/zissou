import { useMemo } from 'react';
import type { Vessel, Position } from '../signalk/types';
import { useAISTargets, useSelf } from '../signalk/useSignalK';

const STALE_MS = 5 * 60 * 1000;

export function AISList() {
  const targets = useAISTargets();
  const self = useSelf();

  const rows = useMemo(() => {
    const selfPos = self?.position;
    return targets
      .map((v) => decorate(v, selfPos))
      .sort((a, b) => {
        // Vessels with a valid position sort by distance; positionless sink to bottom.
        if (a.distanceNm == null && b.distanceNm == null) return 0;
        if (a.distanceNm == null) return 1;
        if (b.distanceNm == null) return -1;
        return a.distanceNm - b.distanceNm;
      });
  }, [targets, self?.position]);

  if (rows.length === 0) {
    return <div className="ais-empty">No AIS targets yet — waiting for data…</div>;
  }

  return (
    <ul className="ais-list">
      {rows.map((r) => (
        <AISRow key={r.vessel.context} row={r} />
      ))}
    </ul>
  );
}

interface DecoratedRow {
  vessel: Vessel;
  displayName: string;
  distanceNm: number | null;
  bearingDeg: number | null;
  isStale: boolean;
  hasValidPosition: boolean;
  flags: string[];
}

function AISRow({ row }: { row: DecoratedRow }) {
  const { vessel, displayName, distanceNm, bearingDeg, isStale, flags } = row;
  return (
    <li className={`ais-row${isStale ? ' ais-row--stale' : ''}`}>
      <div className="ais-row__head">
        <span className="ais-row__name">{displayName}</span>
        {vessel.mmsi && <span className="ais-row__mmsi">MMSI {vessel.mmsi}</span>}
      </div>
      <div className="ais-row__metrics">
        <Metric label="Dist" value={distanceNm != null ? `${distanceNm.toFixed(1)} nm` : '—'} />
        <Metric label="Brg" value={bearingDeg != null ? `${Math.round(bearingDeg)}°` : '—'} />
        <Metric label="SOG" value={vessel.sog != null ? `${vessel.sog.toFixed(1)} kn` : '—'} />
        <Metric label="COG" value={vessel.cog != null && vessel.cog <= 360 ? `${Math.round(vessel.cog)}°` : '—'} />
      </div>
      {flags.length > 0 && (
        <div className="ais-row__flags">
          {flags.map((f) => (
            <span key={f} className="ais-flag">{f}</span>
          ))}
        </div>
      )}
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="ais-metric">
      <span className="ais-metric__label">{label}</span>
      <span className="ais-metric__value">{value}</span>
    </span>
  );
}

function decorate(vessel: Vessel, selfPos: Position | undefined): DecoratedRow {
  const flags: string[] = [];
  const validPos = isPlausiblePosition(vessel.position);
  const isStale = Date.now() - vessel.lastUpdated > STALE_MS;

  if (!vessel.name) flags.push('no-name');
  if (!validPos && vessel.position) flags.push('bad-position');
  if (!vessel.position) flags.push('no-position');
  if (isStale) flags.push('stale');
  if (vessel.cog != null && vessel.cog > 360) flags.push('cog-unavailable');
  if (vessel.sog != null && vessel.sog > 100) flags.push('sog-implausible');
  if (vessel.navState === 'at anchor') flags.push('anchored');

  const displayName = vessel.name ?? (vessel.mmsi ? `Unnamed (${vessel.mmsi})` : 'Unknown vessel');

  let distanceNm: number | null = null;
  let bearingDeg: number | null = null;
  if (validPos && vessel.position && selfPos) {
    distanceNm = haversineNm(selfPos, vessel.position);
    bearingDeg = bearingDegrees(selfPos, vessel.position);
  }

  return {
    vessel,
    displayName,
    distanceNm,
    bearingDeg,
    isStale,
    hasValidPosition: validPos,
    flags,
  };
}

function isPlausiblePosition(p: Position | undefined): boolean {
  if (!p) return false;
  if (p.latitude === 0 && p.longitude === 0) return false; // "null island"
  if (p.latitude < -90 || p.latitude > 90) return false;
  if (p.longitude < -180 || p.longitude > 180) return false;
  return true;
}

function haversineNm(a: Position, b: Position): number {
  const R = 3440.065; // nautical miles
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDegrees(a: Position, b: Position): number {
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function toDeg(r: number) {
  return (r * 180) / Math.PI;
}
