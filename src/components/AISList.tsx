import { useEffect, useMemo, useState } from 'react';
import type { Vessel } from '../signalk/types';
import { useAISTargets, useSelf } from '../signalk/useSignalK';
import {
  buildVesselNarrative,
  computeThreatBand,
  haversineNm,
  isPlausiblePosition,
  type ThreatBand,
} from '../utils/formatters';

const STALE_MS = 5 * 60 * 1000;

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
  const now = useNow(5000);
  const [filter, setFilter] = useState<FilterMode>('all');

  const allRows = useMemo<Row[]>(() => {
    const selfPos = self?.position;
    return targets
      .map((v): Row => {
        const hasValidPosition = isPlausiblePosition(v.position);
        const isStale = now - v.lastUpdated > STALE_MS;
        return {
          vessel: v,
          distanceNm:
            selfPos && hasValidPosition && v.position ? haversineNm(selfPos, v.position) : null,
          narrative: buildVesselNarrative(v, self, now),
          isStale,
          hasValidPosition,
          threatBand: computeThreatBand(v, self, isStale),
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
  }, [targets, self, now]);

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
                  <span className={`threat-pill threat-pill--${threatBand}`}>
                    {threatBand}
                  </span>
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

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
