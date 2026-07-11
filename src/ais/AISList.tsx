import { useMemo, useState } from 'react';
import { AIS_STALE_MS } from '../signalk/types';
import type { Vessel } from '../signalk/types';
import { Icon } from '../icons';
import { useAISTargets, useSelf } from '../signalk/useSignalK';
import type { SavedWaypoint } from '../types/nav';
import { useWaypoints } from '../waypoints/waypointStore';
import { useNowMs } from '../utils/clock';
import { haversineNm, isPlausiblePosition } from '../utils/geometry';
import { buildHazardNarrative, buildVesselNarrative } from '../utils/narrative';
import { computeHazardThreatBand, computeThreatBand, type ThreatBand } from '../utils/threat';

type FilterMode = 'all' | 'active';

interface VesselRow {
  kind: 'vessel';
  vessel: Vessel;
  distanceNm: number | null;
  narrative: ReturnType<typeof buildVesselNarrative>;
  isStale: boolean;
  hasValidPosition: boolean;
  threatBand: ThreatBand;
}

interface HazardRow {
  kind: 'hazard';
  waypoint: SavedWaypoint;
  distanceNm: number;
  narrative: ReturnType<typeof buildHazardNarrative>;
  threatBand: ThreatBand;
}

type Row = VesselRow | HazardRow;

const BAND_ORDER: Record<ThreatBand, number> = { danger: 0, caution: 1, monitor: 2 };

export function AISList({ compact = false }: { compact?: boolean } = {}) {
  const targets = useAISTargets();
  const waypoints = useWaypoints();
  const self = useSelf();
  const now = useNowMs(5000);
  const [filter, setFilter] = useState<FilterMode>('all');

  // Geometry + narrative are stable on (targets, self) — `now` only affects
  // staleness, which we overlay below. This keeps SignalK ticks from
  // re-running haversine/buildNarrative for every vessel every 5 s.
  const baseVesselRows = useMemo(() => {
    const selfPos = self?.position;
    return targets.map((v) => {
      const hasValidPosition = isPlausiblePosition(v.position);
      return {
        vessel: v,
        distanceNm:
          selfPos && hasValidPosition && v.position ? haversineNm(selfPos, v.position) : null,
        hasValidPosition,
      };
    });
  }, [targets, self]);

  const vesselRows = useMemo<VesselRow[]>(() => {
    return baseVesselRows.map(({ vessel, distanceNm, hasValidPosition }): VesselRow => {
      const isStale = now - vessel.lastUpdated > AIS_STALE_MS;
      return {
        kind: 'vessel',
        vessel,
        distanceNm,
        hasValidPosition,
        isStale,
        narrative: buildVesselNarrative(vessel, self, now),
        threatBand: computeThreatBand(vessel, self, isStale),
      };
    });
  }, [baseVesselRows, self, now]);

  // Hazard waypoints within range get injected as rows. Banding is
  // distance-only (see threat.ts) so list order stays stable as own-ship
  // turns — the alarm watcher handles the heading-aware part.
  const hazardRows = useMemo<HazardRow[]>(() => {
    const rows: HazardRow[] = [];
    for (const wp of waypoints) {
      if (wp.category !== 'hazard') continue;
      const hazPos = { latitude: wp.lat, longitude: wp.lon };
      const result = computeHazardThreatBand(hazPos, self);
      if (!result) continue;
      rows.push({
        kind: 'hazard',
        waypoint: wp,
        distanceNm: result.distanceNm,
        narrative: buildHazardNarrative(wp, self),
        threatBand: result.band,
      });
    }
    return rows;
  }, [waypoints, self]);

  const allRows = useMemo<Row[]>(() => {
    return [...vesselRows, ...hazardRows].sort((a, b) => {
      const bandDiff = BAND_ORDER[a.threatBand] - BAND_ORDER[b.threatBand];
      if (bandDiff !== 0) return bandDiff;
      const da = a.distanceNm;
      const db = b.distanceNm;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }, [vesselRows, hazardRows]);

  const visibleRows = filter === 'all' ? allRows : allRows.filter(isActive);
  const hiddenCount = allRows.length - visibleRows.length;

  return (
    <div className={`ais-panel${compact ? ' ais-panel--compact' : ''}`}>
      <FilterBar filter={filter} onChange={setFilter} hiddenCount={hiddenCount} />
      {visibleRows.length === 0 ? (
        <div className="ais-empty">
          {filter === 'active' && allRows.length > 0
            ? 'No active vessels or hazards — all reports are stale, invalid, or positionless.'
            : 'No AIS targets yet — waiting for data…'}
        </div>
      ) : (
        <ul className="ais-list">
          {visibleRows.map((row) =>
            row.kind === 'vessel' ? (
              <VesselRowView key={`v-${row.vessel.context}`} row={row} />
            ) : (
              <HazardRowView key={`h-${row.waypoint.id}`} row={row} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function VesselRowView({ row }: { row: VesselRow }) {
  const { vessel, narrative, isStale, threatBand } = row;
  const classes = [
    'ais-row',
    isStale && 'ais-row--stale',
    threatBand === 'caution' && 'ais-row--caution',
    threatBand === 'danger' && 'ais-row--danger',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes}>
      {threatBand !== 'monitor' && <ThreatPill band={threatBand} />}
      <div className="ais-row__name">{displayName(vessel)}</div>
      <div className="ais-row__location">{narrative.location}</div>
      {narrative.movement && <div className="ais-row__movement">{narrative.movement}</div>}
      {narrative.qualifier && <div className="ais-row__qualifier">{narrative.qualifier}</div>}
      <div className="ais-row__raw">{narrative.rawFacts}</div>
    </li>
  );
}

function HazardRowView({ row }: { row: HazardRow }) {
  const { waypoint, narrative, threatBand } = row;
  const classes = [
    'ais-row',
    'ais-row--hazard',
    threatBand === 'caution' && 'ais-row--caution',
    threatBand === 'danger' && 'ais-row--danger',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes}>
      {threatBand !== 'monitor' && <ThreatPill band={threatBand} />}
      <div className="ais-row__name ais-row__name--hazard">
        <Icon name="hazard" size={20} className="ais-row__hazard-glyph" title="Hazard waypoint" />
        <span>{waypoint.label || 'Hazard'}</span>
      </div>
      <div className="ais-row__location">{narrative.location}</div>
      {narrative.qualifier && <div className="ais-row__qualifier">{narrative.qualifier}</div>}
      <div className="ais-row__raw">{narrative.rawFacts}</div>
    </li>
  );
}

function ThreatPill({ band }: { band: Exclude<ThreatBand, 'monitor'> }) {
  return (
    <span className={`threat-pill threat-pill--${band}`}>
      <span aria-hidden="true" className="threat-pill__glyph">
        {band === 'danger' ? '\u25B2' : '\u25C6'}
      </span>
      {band}
    </span>
  );
}

function FilterBar({
  filter,
  onChange,
  hiddenCount,
}: {
  filter: FilterMode;
  onChange: (f: FilterMode) => void;
  hiddenCount: number;
}) {
  return (
    <div className="ais-filter-bar">
      <div className="ais-filter-toggle" role="group" aria-label="Filter vessels">
        <FilterButton active={filter === 'all'} onClick={() => onChange('all')}>
          All vessels
        </FilterButton>
        <FilterButton active={filter === 'active'} onClick={() => onChange('active')}>
          Active only
        </FilterButton>
      </div>
      {filter === 'active' && hiddenCount > 0 && (
        <div className="ais-filter-count" aria-live="polite">
          {hiddenCount} {hiddenCount === 1 ? 'vessel' : 'vessels'} hidden
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ais-filter-btn${active ? ' ais-filter-btn--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function isActive(row: Row): boolean {
  // Hazards are always "active" — static objects with known position.
  if (row.kind === 'hazard') return true;
  if (row.isStale) return false;
  if (!row.hasValidPosition) return false;
  return true;
}

function displayName(v: Vessel): string {
  if (v.name) return v.name;
  if (v.mmsi) return `Unnamed vessel (MMSI ${v.mmsi})`;
  return 'Unknown vessel';
}
