// Saved waypoints + recent destinations list. Opens from the StatusBar
// "more" button. Primary action per row = set as destination. Per-saved-row
// kebab opens the existing action sheet (Edit / Delete). Top action lets the
// operator save the current GPS position without needing an active Go-To.

import { useState } from 'react';
import type { Position } from '../signalk/types';
import { Icon, type IconName } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import { useSelf } from '../signalk/useSignalK';
import { formatAgo } from '../utils/clock';
import { isPlausiblePosition } from '../utils/geometry';
import type { SavedWaypoint, RecentDestination, WaypointCategory } from '../types/nav';
import { replaceRouteWithSingle } from './routeStore';
import { useWaypoints } from './waypointStore';
import { useRecents } from './recentsStore';
import { WaypointActionSheet } from './WaypointActionSheet';
import { WaypointEditor } from './WaypointEditor';
import { useSuggestedWaypoints } from '../breadcrumbs/useSuggestedWaypoints';
import { formatDwellDate, formatDwellDuration, type DwellTag } from '../breadcrumbs/dwellDetector';
import { LogbookPanel } from '../logbook/LogbookPanel';

interface Props {
  onClose: () => void;
}

export function WaypointsPanel({ onClose }: Props) {
  const waypoints = useWaypoints();
  const recents = useRecents();
  const suggestions = useSuggestedWaypoints();
  const self = useSelf();
  const [actionFor, setActionFor] = useState<SavedWaypoint | null>(null);
  const [saveAt, setSaveAt] = useState<Position | null>(null);
  const [logbookOpen, setLogbookOpen] = useState(false);

  const canSaveCurrent = self?.position != null && isPlausiblePosition(self.position);

  if (logbookOpen) {
    return (
      <LogbookPanel
        onClose={() => {
          setLogbookOpen(false);
          onClose();
        }}
      />
    );
  }

  if (actionFor) {
    return (
      <WaypointActionSheet
        waypoint={actionFor}
        onClose={() => {
          setActionFor(null);
          onClose();
        }}
      />
    );
  }

  if (saveAt) {
    return (
      <WaypointEditor
        mode="create"
        position={saveAt}
        onClose={() => {
          setSaveAt(null);
          onClose();
        }}
      />
    );
  }

  const onPickRow = (
    position: { latitude: number; longitude: number },
    label: string | undefined,
    saved?: SavedWaypoint,
  ) => {
    replaceRouteWithSingle(
      saved
        ? {
            source: 'saved',
            savedId: saved.id,
            position,
            label: saved.label,
          }
        : {
            source: 'recent',
            position,
            label,
          },
    );
    onClose();
  };

  return (
    <SlidePanel open onClose={onClose} labelledBy="wp-panel-title">
      <div className="wp-panel">
        <h2 id="wp-panel-title" className="wp-panel__title">
          Waypoints
        </h2>

        <button
          type="button"
          className="wp-panel__save-current"
          disabled={!canSaveCurrent}
          onClick={() => self?.position && setSaveAt(self.position)}
        >
          {canSaveCurrent ? 'Save current position' : 'Save current position (waiting for GPS)'}
        </button>

        <button
          type="button"
          className="wp-panel__save-current"
          onClick={() => setLogbookOpen(true)}
        >
          Ship's log
        </button>

        {suggestions.length > 0 && (
          <section className="wp-panel__section">
            <h3 className="wp-panel__section-title">
              Suggested from your track ({suggestions.length})
            </h3>
            <ul className="wp-panel__list">
              {suggestions.slice(0, 5).map((s) => (
                <li key={s.id} className="wp-panel__row">
                  <button
                    type="button"
                    className="wp-panel__row-main"
                    onClick={() => setSaveAt(s.center)}
                  >
                    <Icon name={iconForTag(s.suggestedTag)} size={24} />
                    <span className="wp-panel__row-text">
                      <span className="wp-panel__row-label">{labelForTag(s.suggestedTag)}</span>
                      <span className="wp-panel__row-meta">
                        {formatDwellDate(s.startedAt)} · {formatDwellDuration(s.durationMs)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="wp-panel__section">
          <h3 className="wp-panel__section-title">Saved ({waypoints.length})</h3>
          {waypoints.length === 0 ? (
            <p className="wp-panel__empty">
              No saved spots. Drop a pin on the chart, or save your current position.
            </p>
          ) : (
            <ul className="wp-panel__list">
              {waypoints.map((w) => (
                <li key={w.id} className="wp-panel__row">
                  <button
                    type="button"
                    className="wp-panel__row-main"
                    onClick={() => onPickRow({ latitude: w.lat, longitude: w.lon }, w.label, w)}
                  >
                    <Icon name={iconForCategory(w.category)} size={24} />
                    <span className="wp-panel__row-text">
                      <span className="wp-panel__row-label">{w.label}</span>
                      <span className="wp-panel__row-meta">
                        {labelForCategory(w.category)} · {w.lat.toFixed(4)}, {w.lon.toFixed(4)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="wp-panel__row-kebab"
                    aria-label={`More options for ${w.label}`}
                    onClick={() => setActionFor(w)}
                  >
                    <Icon name="more" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wp-panel__section">
          <h3 className="wp-panel__section-title">Recent ({recents.length})</h3>
          {recents.length === 0 ? (
            <p className="wp-panel__empty">No recent destinations.</p>
          ) : (
            <ul className="wp-panel__list">
              {recents.map((r) => (
                <li
                  key={`${r.position.latitude}-${r.position.longitude}-${r.setAt}`}
                  className="wp-panel__row"
                >
                  <button
                    type="button"
                    className="wp-panel__row-main"
                    onClick={() => onPickRow(r.position, r.label)}
                  >
                    <Icon name="pin" size={24} />
                    <span className="wp-panel__row-text">
                      <span className="wp-panel__row-label">
                        {r.label ?? formatCoords(r.position)}
                      </span>
                      <span className="wp-panel__row-meta">{formatAgo(r.setAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SlidePanel>
  );
}

function iconForTag(t: DwellTag): IconName {
  switch (t) {
    case 'anchorage':
    case 'anchorage-overnight':
      return 'anchor';
    case 'mooring':
      return 'mooringBuoy';
  }
}

function labelForTag(t: DwellTag): string {
  switch (t) {
    case 'anchorage-overnight':
      return 'Anchorage — overnight';
    case 'anchorage':
      return 'Anchorage';
    case 'mooring':
      return 'Mooring';
  }
}

function iconForCategory(c: WaypointCategory): IconName {
  switch (c) {
    case 'mooring':
      return 'mooringBuoy';
    case 'anchorage':
      return 'anchor';
    case 'hazard':
      return 'hazard';
    case 'poi':
      return 'star';
  }
}

function labelForCategory(c: WaypointCategory): string {
  switch (c) {
    case 'mooring':
      return 'Mooring';
    case 'anchorage':
      return 'Anchorage';
    case 'hazard':
      return 'Hazard';
    case 'poi':
      return 'Favorite';
  }
}

function formatCoords(p: RecentDestination['position']): string {
  return `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`;
}
