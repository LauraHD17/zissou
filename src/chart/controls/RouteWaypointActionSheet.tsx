// Small action sheet that opens when the operator taps an intermediate
// route waypoint. Single action: remove this pin. Mirrors the shape of
// WaypointActionSheet but doesn't offer edit/save since route waypoints
// are ephemeral.

import { SlidePanel } from '../../ui/SlidePanel';
import type { RouteWaypoint } from '../../types/nav';
import { removeWaypoint } from '../../waypoints/routeStore';

interface Props {
  waypoint: RouteWaypoint;
  onClose: () => void;
}

export function RouteWaypointActionSheet({ waypoint, onClose }: Props) {
  return (
    <SlidePanel open onClose={onClose} labelledBy="route-wp-action-title">
      <h2 id="route-wp-action-title" className="action-sheet__title">
        Route waypoint
      </h2>
      <p className="action-sheet__meta">
        {waypoint.position.latitude.toFixed(4)}, {waypoint.position.longitude.toFixed(4)}
      </p>
      <div className="action-sheet__buttons">
        <button
          type="button"
          className="action-sheet__btn action-sheet__btn--danger"
          onClick={() => {
            removeWaypoint(waypoint.id);
            onClose();
          }}
        >
          Remove this pin
        </button>
        <button type="button" className="action-sheet__btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </SlidePanel>
  );
}
