import { SlidePanel } from '../ui/SlidePanel';
import type { SavedWaypoint } from '../types/nav';
import { setDestination } from './destinationStore';
import { removeWaypoint } from './waypointStore';

interface Props {
  waypoint: SavedWaypoint;
  onClose: () => void;
}

export function WaypointActionSheet({ waypoint, onClose }: Props) {
  return (
    <SlidePanel open onClose={onClose} labelledBy="wp-action-title">
      <h2 id="wp-action-title" className="action-sheet__title">{waypoint.label}</h2>
      <p className="action-sheet__meta">
        {labelForCategory(waypoint.category)} · {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
      </p>
      <div className="action-sheet__buttons">
        <button
          type="button"
          className="action-sheet__btn"
          onClick={() => {
            setDestination({
              source: 'saved',
              savedId: waypoint.id,
              position: { latitude: waypoint.lat, longitude: waypoint.lon },
              label: waypoint.label,
              setAt: Date.now(),
            });
            onClose();
          }}
        >
          Set as destination
        </button>
        <button
          type="button"
          className="action-sheet__btn action-sheet__btn--danger"
          onClick={() => {
            removeWaypoint(waypoint.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </SlidePanel>
  );
}

function labelForCategory(c: SavedWaypoint['category']): string {
  switch (c) {
    case 'mooring': return 'Mooring';
    case 'anchorage': return 'Anchorage';
    case 'hazard': return 'Hazard';
    case 'poi': return 'Spot';
  }
}
