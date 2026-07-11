// The chart's tap-target detail panels and action sheets, grouped so
// ChartCanvas stays a composition root. Purely presentational — state and
// setters live with the marker/tap hooks that produce them.

import type { Vessel, Position } from '../signalk/types';
import type { RouteWaypoint, SavedWaypoint } from '../types/nav';
import { WaypointActionSheet } from '../waypoints/WaypointActionSheet';
import { WaypointEditor } from '../waypoints/WaypointEditor';
import { AISDetailPanel } from './detail/AISDetailPanel';
import { NavaidDetailPanel, type NavaidFeature } from './detail/NavaidDetailPanel';
import { RouteWaypointActionSheet } from './controls/RouteWaypointActionSheet';

interface Props {
  tappedWaypoint: SavedWaypoint | null;
  tappedRouteWp: RouteWaypoint | null;
  tappedVessel: Vessel | null;
  tappedNavaid: NavaidFeature | null;
  saveAt: Position | null;
  onCloseWaypoint: () => void;
  onCloseRouteWp: () => void;
  onCloseVessel: () => void;
  onCloseNavaid: () => void;
  onCloseSave: () => void;
}

export function ChartPanels({
  tappedWaypoint,
  tappedRouteWp,
  tappedVessel,
  tappedNavaid,
  saveAt,
  onCloseWaypoint,
  onCloseRouteWp,
  onCloseVessel,
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
      {tappedVessel && <AISDetailPanel vessel={tappedVessel} onClose={onCloseVessel} />}
      {tappedNavaid && <NavaidDetailPanel feature={tappedNavaid} onClose={onCloseNavaid} />}
      {saveAt && <WaypointEditor mode="create" position={saveAt} onClose={onCloseSave} />}
    </>
  );
}
