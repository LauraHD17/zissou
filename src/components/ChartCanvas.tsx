import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { computeThreatBand, isPlausiblePosition, projectPosition } from '../utils/formatters';
import type { Position, Vessel } from '../signalk/types';

const FALLBACK_CENTER: [number, number] = [44.4, -68.8]; // mid-coast Maine
const DEFAULT_ZOOM = 12;
const STALE_MS = 5 * 60 * 1000;

export function ChartCanvas() {
  const self = useSelf();
  const targets = useAISTargets();
  const now = Date.now();

  const initialCenter = useMemo<[number, number]>(() => {
    if (self?.position && isPlausiblePosition(self.position)) {
      return [self.position.latitude, self.position.longitude];
    }
    return FALLBACK_CENTER;
  }, []); // intentionally only on mount — auto-recenter handles updates

  return (
    <MapContainer
      center={initialCenter}
      zoom={DEFAULT_ZOOM}
      className="chart-map"
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ResizeObserverBridge />
      <AutoRecenter pos={self?.position} />

      {self?.position && isPlausiblePosition(self.position) && (
        <>
          <HeadingVector pos={self.position} cogRad={self.cog} sogMs={self.sog} />
          <OwnShipMarker pos={self.position} cogRad={self.cog} />
        </>
      )}

      {targets.map((v) => {
        if (!v.position || !isPlausiblePosition(v.position)) return null;
        const isStale = now - v.lastUpdated > STALE_MS;
        const band = computeThreatBand(v, self, isStale);
        return (
          <AISTargetMarker
            key={v.context}
            vessel={v}
            band={band}
            isStale={isStale}
          />
        );
      })}
    </MapContainer>
  );
}

// ── Own-ship marker (triple design: triangle + pulsing ring + heading vector) ─

function OwnShipMarker({ pos, cogRad }: { pos: Position; cogRad: number | undefined }) {
  const headingDeg = cogRad != null && cogRad <= Math.PI * 2 ? (cogRad * 180) / Math.PI : 0;

  // 56px container leaves 8px room for the ring's max scale (1.4× of 40px = 56px).
  // Triangle is 40px, centered. Pulse ring sits underneath, animated via CSS.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'own-ship-marker',
        html: `
          <div class="own-ship-marker__pulse" aria-hidden="true"></div>
          <svg class="own-ship-marker__triangle"
               viewBox="0 0 40 40" width="40" height="40"
               style="transform: rotate(${headingDeg}deg)"
               aria-hidden="true">
            <path d="M 20 4 L 34 36 L 20 28 L 6 36 Z" />
          </svg>
        `,
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      }),
    [headingDeg],
  );
  return <Marker position={[pos.latitude, pos.longitude]} icon={icon} interactive={false} />;
}

/** Predictive 1-minute path from current position along COG at current SOG. */
function HeadingVector({
  pos,
  cogRad,
  sogMs,
}: {
  pos: Position;
  cogRad: number | undefined;
  sogMs: number | undefined;
}) {
  if (cogRad == null || cogRad < 0 || cogRad > Math.PI * 2) return null;
  if (sogMs == null || sogMs < 0.25 || sogMs > 60) return null; // skip when stopped or implausible

  const distanceM = sogMs * 60; // 1 minute of travel
  const end = projectPosition(pos, cogRad, distanceM);

  return (
    <Polyline
      positions={[
        [pos.latitude, pos.longitude],
        [end.latitude, end.longitude],
      ]}
      pathOptions={{ weight: 2, className: 'heading-vector', interactive: false }}
    />
  );
}

// ── AIS target markers ──────────────────────────────────────────────────

function AISTargetMarker({
  vessel,
  band,
  isStale,
}: {
  vessel: Vessel;
  band: 'monitor' | 'caution' | 'danger';
  isStale: boolean;
}) {
  const cogRad = vessel.cog;
  const hasHeading = cogRad != null && cogRad >= 0 && cogRad <= Math.PI * 2;
  const headingDeg = hasHeading ? (cogRad! * 180) / Math.PI : 0;

  const classes = [
    'ais-target-marker',
    `ais-target-marker--${band}`,
    isStale && 'ais-target-marker--stale',
  ]
    .filter(Boolean)
    .join(' ');

  // If we have a heading, render an oriented chevron; otherwise a circle (e.g. anchored).
  const html = hasHeading
    ? `<svg viewBox="0 0 16 16" width="16" height="16" style="transform: rotate(${headingDeg}deg)">
         <path d="M 8 1 L 14 14 L 8 11 L 2 14 Z" />
       </svg>`
    : `<svg viewBox="0 0 16 16" width="14" height="14">
         <circle cx="8" cy="8" r="5" />
       </svg>`;

  const icon = useMemo(
    () => L.divIcon({ className: classes, html, iconSize: [16, 16], iconAnchor: [8, 8] }),
    [classes, html],
  );

  return (
    <Marker position={[vessel.position!.latitude, vessel.position!.longitude]} icon={icon} />
  );
}

// ── Map helpers ─────────────────────────────────────────────────────────

/** Re-center map when own-ship position updates. v1: always recenters. */
function AutoRecenter({ pos }: { pos: Position | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (pos && isPlausiblePosition(pos)) {
      map.setView([pos.latitude, pos.longitude], map.getZoom(), { animate: false });
    }
  }, [pos?.latitude, pos?.longitude, map]);
  return null;
}

/**
 * Leaflet caches its container size on init and doesn't notice when CSS
 * display toggles change it. Watch the container for resize events and
 * call invalidateSize so tiles redraw correctly when the user toggles
 * between split / chart-only views.
 */
function ResizeObserverBridge() {
  const map = useMap();
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    containerRef.current = container;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);

  return null;
}
