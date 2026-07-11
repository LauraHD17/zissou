// Composition root for the chart: wires the map instance, marker hooks,
// tap/pick interactions, and overlay controls together. The heavy lifting
// lives in hooks/ (map lifecycle, modes, taps) and markers/ (per-entity
// marker sync); tap-target panels are grouped in ChartPanels.

import { useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { useOwnShipMarker } from './markers/OwnShipMarker';
import { useAISMarkers } from './markers/AISMarkers';
import { useHeadingVector } from './markers/HeadingVector';
import { useDestinationMarker } from './markers/DestinationMarker';
import { useGoToRoute } from './markers/GoToRoute';
import { useWaypointMarkers } from './markers/WaypointMarkers';
import { useAnchorCircle } from './markers/AnchorCircle';
import { useMOBMarker } from './markers/MOBMarker';
import { useRouteViaMarkers } from './markers/RouteViaMarkers';
import { useChartMode } from './hooks/useChartMode';
import { useMapInstance, DEFAULT_ZOOM } from './hooks/useMapInstance';
import { useChartPickMode } from './hooks/useChartPickMode';
import { useTideAwareContours } from './hooks/useTideAwareContours';
import { useNavaidTaps } from './hooks/useNavaidTaps';
import { useNavaidSpriteTheme } from './hooks/useNavaidSpriteTheme';
import { useChartLayerVisibility } from './hooks/useChartLayerVisibility';
import { ChartPanels } from './ChartPanels';
import { MapControls } from './controls/MapControls';
import { ScaleBar } from './controls/ScaleBar';
import { DepthLegend } from './controls/DepthLegend';
import { NavaidLegend } from './controls/NavaidLegend';
import { SoundingLegend } from './controls/SoundingLegend';
import { DropPinButton } from './controls/DropPinButton';
import { SaveWaypointButton } from './controls/SaveWaypointButton';
import { DestinationWidget } from './controls/DestinationWidget';
import { RouteBuildPill } from './controls/RouteBuildPill';
import { AnchorButton } from '../anchor/AnchorButton';
import { SafeReturnPill } from '../safety/SafeReturnPill';
import { RouteTidePill } from '../safety/RouteTidePill';
import { WeatherPill } from '../weather/WeatherPill';
import { appendWaypoint, removeWaypoint } from '../waypoints/routeStore';
import type { NavaidFeature } from './detail/NavaidDetailPanel';
import type { Vessel, Position } from '../signalk/types';
import type { RouteWaypoint, SavedWaypoint } from '../types/nav';

export { DEFAULT_ZOOM };

/** 90° corner brackets at the chart viewport — marine plotter / reticle feel. */
function FiducialCorners() {
  return (
    <div className="chart-fiducials" aria-hidden="true">
      <span className="chart-fiducials__corner chart-fiducials__corner--tl" />
      <span className="chart-fiducials__corner chart-fiducials__corner--tr" />
      <span className="chart-fiducials__corner chart-fiducials__corner--bl" />
      <span className="chart-fiducials__corner chart-fiducials__corner--br" />
    </div>
  );
}

export function ChartCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoadedRef = useRef(false);

  const self = useSelf();
  const targets = useAISTargets();
  const { mode, setMode, modeRef } = useChartMode(mapRef, styleLoadedRef);
  const { following, handleRecenter } = useMapInstance({
    containerRef,
    mapRef,
    styleLoadedRef,
    modeRef,
    self,
  });

  const [pickMode, setPickMode] = useState<'idle' | 'destination' | 'waypoint'>('idle');
  // Ref mirror of pickMode so useNavaidTaps can skip handling while a pick
  // mode is armed without being recreated on every mode change.
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const [saveAt, setSaveAt] = useState<Position | null>(null);
  const [tappedWaypoint, setTappedWaypoint] = useState<SavedWaypoint | null>(null);
  const [tappedRouteWp, setTappedRouteWp] = useState<RouteWaypoint | null>(null);
  const [tappedVessel, setTappedVessel] = useState<Vessel | null>(null);
  const [tappedNavaid, setTappedNavaid] = useState<NavaidFeature | null>(null);

  useOwnShipMarker(mapRef, self);
  useAISMarkers(mapRef, targets, self, { onTap: setTappedVessel });
  useHeadingVector(mapRef, self);
  useDestinationMarker(mapRef, { onTap: setTappedRouteWp });
  useGoToRoute(mapRef);
  useWaypointMarkers(mapRef, { onTap: setTappedWaypoint });
  useAnchorCircle(mapRef);
  useTideAwareContours(mapRef);
  useMOBMarker(mapRef);
  useNavaidSpriteTheme(mapRef);
  useNavaidTaps(mapRef, { onTap: setTappedNavaid, pickModeRef });
  useChartLayerVisibility(mapRef);
  // Vias remove directly on tap — intermediate pins are cheap to re-drop and
  // an extra confirmation felt like noise. Destination removal still goes
  // through the action sheet (ChartPanels) because losing the final
  // destination is more disruptive.
  useRouteViaMarkers(mapRef, { onTap: (wp) => removeWaypoint(wp.id) });
  useChartPickMode(mapRef, {
    armed: pickMode !== 'idle',
    onPick: (pos) => {
      if (pickMode === 'destination') {
        // Route-build mode: each tap appends to the route. Mode stays armed
        // until the operator taps Done (or toggles drop-pin off).
        appendWaypoint({ position: pos, source: 'drop-pin' });
      } else if (pickMode === 'waypoint') {
        setSaveAt(pos);
        setPickMode('idle');
      }
    },
  });

  const togglePickMode = (mode: 'destination' | 'waypoint') =>
    setPickMode((prev) => (prev === mode ? 'idle' : mode));

  return (
    <div className={`chart-canvas${pickMode !== 'idle' ? ' chart-canvas--picking' : ''}`}>
      <div ref={containerRef} className="chart-map" />
      <FiducialCorners />
      <MapControls
        mode={mode}
        following={following}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onRecenter={handleRecenter}
        onModeToggle={() => setMode((m) => (m === 'marine' ? 'harbor' : 'marine'))}
        dropPinSlot={
          <DropPinButton
            armed={pickMode === 'destination'}
            onToggle={() => togglePickMode('destination')}
          />
        }
        saveWaypointSlot={
          <SaveWaypointButton
            armed={pickMode === 'waypoint'}
            onToggle={() => togglePickMode('waypoint')}
          />
        }
        anchorSlot={<AnchorButton />}
      />
      <DestinationWidget />
      <div className="chart-overlay-stack">
        <RouteTidePill mapRef={mapRef} />
        <WeatherPill />
        <SafeReturnPill />
      </div>
      <ScaleBar mapRef={mapRef} />
      <div className="chart-legend-stack">
        <DepthLegend />
        <SoundingLegend />
        <NavaidLegend />
      </div>
      {pickMode === 'destination' && <RouteBuildPill onDone={() => setPickMode('idle')} />}
      <ChartPanels
        tappedWaypoint={tappedWaypoint}
        tappedRouteWp={tappedRouteWp}
        tappedVessel={tappedVessel}
        tappedNavaid={tappedNavaid}
        saveAt={saveAt}
        onCloseWaypoint={() => setTappedWaypoint(null)}
        onCloseRouteWp={() => setTappedRouteWp(null)}
        onCloseVessel={() => setTappedVessel(null)}
        onCloseNavaid={() => setTappedNavaid(null)}
        onCloseSave={() => setSaveAt(null)}
      />
    </div>
  );
}
