import { useMemo, useState } from 'react';
import { AIS_STALE_MS } from '../signalk/types';
import type { Vessel } from '../signalk/types';
import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { useNowMs } from '../utils/clock';
import { haversineNm, isPlausiblePosition } from '../utils/geometry';
import { buildVesselNarrative } from '../utils/narrative';
import { computeThreatBand, type ThreatBand } from '../utils/threat';

type FilterMode = 'all' | 'active';

interface Row {
  vessel: Vessel;
  distanceNm: number | null;
  narrative: ReturnType<typeof buildVesselNarrative>;
  isStale: boolean;
  hasValidPosition: boolean;
  threatBand: ThreatBand;
}

const BAND_ORDER: Record<ThreatBand, number> = { danger: 0, caution: 1, monitor: 2 };

export function AISList({ compact = false }: { compact?: boolean } = {}) {
  const targets = useAISTargets();
  const self = useSelf();
  const now = useNowMs(5000);
  const [filter, setFilter] = useState<FilterMode>('all');

  // Geometry + narrative are stable on (targets, self) — `now` only affects
  // staleness, which we overlay below. This keeps SignalK ticks from
  // re-running haversine/buildNarrative for every vessel every 5 s.
  const baseRows = useMemo(() => {
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

  const allRows = useMemo<Row[]>(() => {
    return baseRows
      .map(({ vessel, distanceNm, hasValidPosition }): Row => {
        const isStale = now - vessel.lastUpdated > AIS_STALE_MS;
        return {
          vessel,
          distanceNm,
          hasValidPosition,
          isStale,
          narrative: buildVesselNarrative(vessel, self, now),
          threatBand: computeThreatBand(vessel, self, isStale),
        };
      })
      .sort((a, b) => {
        const bandDiff = BAND_ORDER[a.threatBand] - BAND_ORDER[b.threatBand];
        if (bandDiff !== 0) return bandDiff;
        if (a.distanceNm == null && b.distanceNm == null) return 0;
        if (a.distanceNm == null) return 1;
        if (b.distanceNm == null) return -1;
        return a.distanceNm - b.distanceNm;
      });
  }, [baseRows, self, now]);

  const visibleRows = filter === 'all' ? allRows : allRows.filter(isActive);
  const hiddenCount = allRows.length - visibleRows.length;

  return (
    <div className={`ais-panel${compact ? ' ais-panel--compact' : ''}`}>
      <FilterBar filter={filter} onChange={setFilter} hiddenCount={hiddenCount} />
      {visibleRows.length === 0 ? (
        <div className="ais-empty">
          {filter === 'active' && allRows.length > 0
            ? 'No active vessels — all reports are stale, invalid, or positionless.'
            : 'No AIS targets yet — waiting for data…'}
        </div>
      ) : (
        <ul className="ais-list">
          {visibleRows.map(({ vessel, narrative, isStale, threatBand }) => {
            const classes = [
              'ais-row',
              isStale && 'ais-row--stale',
              threatBand === 'caution' && 'ais-row--caution',
              threatBand === 'danger' && 'ais-row--danger',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={vessel.context} className={classes}>
                {threatBand !== 'monitor' && (
                  <span className={`threat-pill threat-pill--${threatBand}`}>{threatBand}</span>
                )}
                <div className="ais-row__name">{displayName(vessel)}</div>
                <div className="ais-row__location">{narrative.location}</div>
                {narrative.movement && (
                  <div className="ais-row__movement">{narrative.movement}</div>
                )}
                {narrative.qualifier && (
                  <div className="ais-row__qualifier">{narrative.qualifier}</div>
                )}
                <div className="ais-row__raw">{narrative.rawFacts}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
  if (row.isStale) return false;
  if (!row.hasValidPosition) return false;
  return true;
}

function displayName(v: Vessel): string {
  if (v.name) return v.name;
  if (v.mmsi) return `Unnamed vessel (MMSI ${v.mmsi})`;
  return 'Unknown vessel';
}
