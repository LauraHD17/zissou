import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';

import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition } from '../utils/geometry';
import { BASE_STYLE_URL, applyMarineStyle } from './marineStyle';
import { useOwnShipMarker } from './markers/OwnShipMarker';
import { useAISMarkers } from './markers/AISMarkers';
import { ensureHeadingVectorLayer, useHeadingVector } from './markers/HeadingVector';
import { useDestinationMarker } from './markers/DestinationMarker';
import { ensureGoToRouteLayer, useGoToRoute } from './markers/GoToRoute';
import { useWaypointMarkers } from './markers/WaypointMarkers';
import { WaypointActionSheet } from '../waypoints/WaypointActionSheet';
import type { SavedWaypoint } from '../types/nav';
import { ensureAnchorCircleLayers, useAnchorCircle } from './markers/AnchorCircle';
import { AnchorButton } from '../anchor/AnchorButton';
import { useAnchorDragWatch } from '../anchor/useAnchorDragWatch';
import { useMOBMarker } from './markers/MOBMarker';
import { AISDetailPanel } from './AISDetailPanel';
import type { Vessel } from '../signalk/types';
import { MapControls } from './controls/MapControls';
import { ScaleBar } from './controls/ScaleBar';
import { DepthLegend } from './controls/DepthLegend';
import { DropPinButton } from './controls/DropPinButton';
import { SaveWaypointButton } from './controls/SaveWaypointButton';
import { DestinationWidget } from './controls/DestinationWidget';
import { SafeReturnPill } from '../safety/SafeReturnPill';
import { RouteTidePill } from '../safety/RouteTidePill';
import { WeatherPill } from '../weather/WeatherPill';
import { useChartMode } from './hooks/useChartMode';
import { useChartPickMode } from './hooks/useChartPickMode';
import { useTideAwareContours } from './hooks/useTideAwareContours';
import { setDestination } from '../waypoints/destinationStore';
import { WaypointEditor } from '../waypoints/WaypointEditor';
import type { Position } from '../signalk/types';

const FALLBACK_CENTER: [number, number] = [-68.8, 44.4]; // [lng, lat] mid-coast Maine
const DEFAULT_ZOOM = 12;

// Idempotent: pmtiles:// protocol only needs to be registered once per page.
let pmtilesProtocolRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesProtocolRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  pmtilesProtocolRegistered = true;
}

export function ChartCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoadedRef = useRef(false);

  const self = useSelf();
  const targets = useAISTargets();
  const { mode, setMode, modeRef } = useChartMode(mapRef, styleLoadedRef);
  const [pickMode, setPickMode] = useState<'idle' | 'destination' | 'waypoint'>('idle');
  const [saveAt, setSaveAt] = useState<Position | null>(null);
  const [tappedWaypoint, setTappedWaypoint] = useState<SavedWaypoint | null>(null);
  const [tappedVessel, setTappedVessel] = useState<Vessel | null>(null);
  // Auto-recenter vs free-pan. User drag/zoom suspends tracking; Recenter
  // button re-engages it.
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  followingRef.current = following;

  useEffect(() => {
    if (!containerRef.current) return;
    ensurePmtilesProtocol();

    const initialCenter: [number, number] =
      self?.position && isPlausiblePosition(self.position)
        ? [self.position.longitude, self.position.latitude]
        : FALLBACK_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: false },
    });

    map.on('style.load', () => {
      styleLoadedRef.current = true;
      if (modeRef.current === 'marine') applyMarineStyle(map);
      ensureHeadingVectorLayer(map);
      ensureGoToRouteLayer(map);
      ensureAnchorCircleLayers(map);
    });

    // Suspend auto-recenter when the operator pans or zooms manually.
    // `originalEvent` is only set on user-initiated moves; programmatic
    // setCenter / flyTo don't fire with one, so they don't toggle us off.
    const onUserMove = (e: { originalEvent?: Event }) => {
      if (e.originalEvent && followingRef.current) setFollowing(false);
    };
    map.on('dragstart', onUserMove);
    map.on('zoomstart', onUserMove);

    mapRef.current = map;

    // View-mode toggle uses display:none, which window.resize doesn't see.
    // Watch the container so tiles reflow correctly on mode switches.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // Init runs once; auto-recenter handles position updates.
  }, []);

  useOwnShipMarker(mapRef, self);
  useAISMarkers(mapRef, targets, self, { onTap: setTappedVessel });
  useHeadingVector(mapRef, self);
  useDestinationMarker(mapRef);
  useGoToRoute(mapRef);
  useWaypointMarkers(mapRef, { onTap: setTappedWaypoint });
  useAnchorCircle(mapRef);
  useTideAwareContours(mapRef);
  useAnchorDragWatch();
  useMOBMarker(mapRef);
  useChartPickMode(mapRef, {
    armed: pickMode !== 'idle',
    onPick: (pos) => {
      if (pickMode === 'destination') {
        setDestination({ source: 'goto-pin', position: pos, setAt: Date.now() });
        setPickMode('idle');
      } else if (pickMode === 'waypoint') {
        setSaveAt(pos);
        setPickMode('idle');
      }
    },
  });

  const togglePickMode = (mode: 'destination' | 'waypoint') =>
    setPickMode((prev) => (prev === mode ? 'idle' : mode));

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !following) return;
    if (!self?.position || !isPlausiblePosition(self.position)) return;
    map.setCenter([self.position.longitude, self.position.latitude]);
  }, [self?.position?.latitude, self?.position?.longitude, following]);

  const handleRecenter = () => {
    setFollowing(true);
    const map = mapRef.current;
    if (!map || !self?.position || !isPlausiblePosition(self.position)) return;
    map.flyTo({
      center: [self.position.longitude, self.position.latitude],
      zoom: DEFAULT_ZOOM,
      duration: 400,
    });
  };

  return (
    <div className="chart-canvas">
      <div ref={containerRef} className="chart-map" />
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
      <DepthLegend />
      {tappedWaypoint && (
        <WaypointActionSheet waypoint={tappedWaypoint} onClose={() => setTappedWaypoint(null)} />
      )}
      {tappedVessel && (
        <AISDetailPanel vessel={tappedVessel} onClose={() => setTappedVessel(null)} />
      )}
      {saveAt && <WaypointEditor mode="create" position={saveAt} onClose={() => setSaveAt(null)} />}
    </div>
  );
}
