// The chart's tap-target detail panels and action sheets, grouped so
// ChartCanvas stays a composition root. Purely presentational — state and
// setters live with the marker/tap hooks that produce them.

import type { Position } from '../signalk/types';
import type { RouteWaypoint, SavedWaypoint } from '../types/nav';
import { WaypointActionSheet } from '../waypoints/WaypointActionSheet';
import { WaypointEditor } from '../waypoints/WaypointEditor';
import { NavaidDetailPanel, type NavaidFeature } from './detail/NavaidDetailPanel';
import { RouteWaypointActionSheet } from './controls/RouteWaypointActionSheet';

// Vessel detail is NOT here — it renders app-level via VesselDetailHost so
// the AIS list can open it too (and in AIS-only mode without the chart).

interface Props {
  tappedWaypoint: SavedWaypoint | null;
  tappedRouteWp: RouteWaypoint | null;
  tappedNavaid: NavaidFeature | null;
  saveAt: Position | null;
  onCloseWaypoint: () => void;
  onCloseRouteWp: () => void;
  onCloseNavaid: () => void;
  onCloseSave: () => void;
}

export function ChartPanels({
  tappedWaypoint,
  tappedRouteWp,
  tappedNavaid,
  saveAt,
  onCloseWaypoint,
  onCloseRouteWp,
  onCloseNavaid,
  onCloseSave,
}: Props) {
  return (
    <>
      {tappedWaypoint && (
        <WaypointActionSheet waypoint={tappedWaypoint} onClose={onCloseWaypoint} />
      )}
      {tappedRouteWp && (
        <RouteWaypointActionSheet waypoint={tappedRouteWp} onClose={onCloseRouteWp} />
      )}
      {tappedNavaid && <NavaidDetailPanel feature={tappedNavaid} onClose={onCloseNavaid} />}
      {saveAt && <WaypointEditor mode="create" position={saveAt} onClose={onCloseSave} />}
    </>
  );
}
