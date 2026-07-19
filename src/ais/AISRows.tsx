// Presentational pieces of the AIS panel: vessel/hazard rows, threat pill,
// relay status strip, and the filter bar. Data shaping lives in useAisRows;
// the container is AISList.

import { Icon } from '../icons';
import type { Vessel } from '../signalk/types';
import type { ThreatBand } from '../utils/threat';
import type { FilterMode, HazardRow, VesselRow } from './useAisRows';
import type { InternetAisStatus } from './useInternetAis';
import { selectVessel } from './vesselSelectionStore';

export function VesselRowView({ row }: { row: VesselRow }) {
  const { vessel, narrative, isStale, threatBand } = row;
  const classes = [
    'ais-row',
    'ais-row--tappable',
    isStale && 'ais-row--stale',
    threatBand === 'caution' && 'ais-row--caution',
    threatBand === 'danger' && 'ais-row--danger',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes}>
      {/* Whole card is one button opening the detail panel — same panel a
          chart-marker tap opens. Only the context string is captured; the
          host resolves the live vessel (copy-on-write safe). */}
      <button
        type="button"
        className="ais-row__btn"
        onClick={() => selectVessel(vessel.context)}
        aria-haspopup="dialog"
        aria-label={`${displayName(vessel)} — details`}
      >
        {threatBand !== 'monitor' && <ThreatPill band={threatBand} />}
        <div className="ais-row__name">{displayName(vessel)}</div>
        <div className="ais-row__location">{narrative.location}</div>
        {narrative.movement && <div className="ais-row__movement">{narrative.movement}</div>}
        {narrative.qualifier && <div className="ais-row__qualifier">{narrative.qualifier}</div>}
        <div className="ais-row__raw">{narrative.rawFacts}</div>
      </button>
    </li>
  );
}

export function HazardRowView({ row }: { row: HazardRow }) {
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

/** Connection state for the internet shore relay. Always visible while the
 *  feature is on — an empty list with the relay down must not read as "no
 *  traffic out there." */
export function NetStatusStrip({ status }: { status: Exclude<InternetAisStatus, 'off'> }) {
  const text =
    status === 'connected'
      ? 'Shore AIS relay: receiving. Relayed positions may be delayed — treat as awareness, not collision avoidance.'
      : status === 'connecting'
        ? 'Shore AIS relay: connecting…'
        : status === 'rejected'
          ? 'Shore AIS relay: aisstream.io refused the API key — check it in Settings against your aisstream.io account.'
          : 'Shore AIS relay: offline — no cell signal or service unreachable.';
  return (
    <div
      className={`ais-net-status${status === 'offline' || status === 'rejected' ? ' ais-net-status--offline' : ''}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

function ThreatPill({ band }: { band: Exclude<ThreatBand, 'monitor'> }) {
  return (
    <span className={`threat-pill threat-pill--${band}`}>
      <span aria-hidden="true" className="threat-pill__glyph">
        {band === 'danger' ? '▲' : '◆'}
      </span>
      {band}
    </span>
  );
}

export function FilterBar({
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

function displayName(v: Vessel): string {
  if (v.name) return v.name;
  if (v.mmsi) return `Unnamed vessel (MMSI ${v.mmsi})`;
  return 'Unknown vessel';
}
