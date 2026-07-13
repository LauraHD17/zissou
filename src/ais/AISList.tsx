// AIS panel container: filter state + empty-state copy. Row building lives in
// useAisRows (data), row rendering in AISRows (views).

import { useState } from 'react';
import { useAisRows, type FilterMode } from './useAisRows';
import { FilterBar, HazardRowView, NetStatusStrip, VesselRowView } from './AISRows';
import { useInternetAisStatus } from './useInternetAis';

export function AISList({ compact = false }: { compact?: boolean } = {}) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const { visibleRows, hiddenCount } = useAisRows(filter);
  const netStatus = useInternetAisStatus();

  return (
    <div className={`ais-panel${compact ? ' ais-panel--compact' : ''}`}>
      <FilterBar filter={filter} onChange={setFilter} hiddenCount={hiddenCount} />
      {netStatus !== 'off' && <NetStatusStrip status={netStatus} />}
      {visibleRows.length === 0 ? (
        <div className="ais-empty">
          {filter === 'active' && hiddenCount > 0
            ? 'No active vessels or hazards — all reports are stale, invalid, or positionless.'
            : netStatus === 'offline'
              ? 'No AIS targets — and the shore relay is offline, so this may not mean no traffic.'
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
