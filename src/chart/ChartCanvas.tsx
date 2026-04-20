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
import { MapControls } from './controls/MapControls';
import { ScaleBar } from './controls/ScaleBar';
import { DropPinButton } from './controls/DropPinButton';
import { DestinationWidget } from './controls/DestinationWidget';
import { useChartMode } from './hooks/useChartMode';
import { useDropPinMode } from './hooks/useDropPinMode';

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
  const [dropPinArmed, setDropPinArmed] = useState(false);
  const [tappedWaypoint, setTappedWaypoint] = useState<SavedWaypoint | null>(null);

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
    });

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
  useAISMarkers(mapRef, targets, self);
  useHeadingVector(mapRef, self);
  useDestinationMarker(mapRef);
  useGoToRoute(mapRef);
  useWaypointMarkers(mapRef, { onTap: setTappedWaypoint });
  useDropPinMode(mapRef, {
    armed: dropPinArmed,
    onDrop: () => setDropPinArmed(false),
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !self?.position || !isPlausiblePosition(self.position)) return;
    map.setCenter([self.position.longitude, self.position.latitude]);
  }, [self?.position?.latitude, self?.position?.longitude]);

  const handleRecenter = () => {
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
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onRecenter={handleRecenter}
        onModeToggle={() => setMode((m) => (m === 'marine' ? 'harbor' : 'marine'))}
        dropPinSlot={
          <DropPinButton
            armed={dropPinArmed}
            onToggle={() => setDropPinArmed((a) => !a)}
          />
        }
      />
      <DestinationWidget />
      <ScaleBar mapRef={mapRef} />
      {tappedWaypoint && (
        <WaypointActionSheet
          waypoint={tappedWaypoint}
          onClose={() => setTappedWaypoint(null)}
        />
      )}
    </div>
  );
}
