import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { computeThreatBand, isPlausiblePosition, projectPosition } from '../utils/formatters';
import type { Vessel } from '../signalk/types';
import { BASE_STYLE_URL, applyMarineStyle } from '../chart/marineStyle';

type ChartMode = 'marine' | 'harbor';

const FALLBACK_CENTER: [number, number] = [-68.8, 44.4]; // [lng, lat] mid-coast Maine
const DEFAULT_ZOOM = 12;
const STALE_MS = 5 * 60 * 1000;
const HEADING_VECTOR_SOURCE = 'heading-vector';
const HEADING_VECTOR_LAYER = 'heading-vector-line';
const SVG_NS = 'http://www.w3.org/2000/svg';

interface AISMarkerEntry {
  marker: maplibregl.Marker;
  hasHeading: boolean; // whether the inner SVG was built as a chevron (true) or circle (false)
}

export function ChartCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const ownShipMarkerRef = useRef<maplibregl.Marker | null>(null);
  const aisMarkersRef = useRef<Map<string, AISMarkerEntry>>(new Map());

  const self = useSelf();
  const targets = useAISTargets();

  const [mode, setMode] = useState<ChartMode>('marine');
  // Mirror mode in a ref so the style.load handler (registered once) can read it.
  const modeRef = useRef<ChartMode>('marine');
  modeRef.current = mode;

  const [scale, setScale] = useState<{ widthPx: number; label: string } | null>(null);

  // ── Init map once ────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

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
      if (modeRef.current === 'marine') {
        applyMarineStyle(map);
      }
      ensureHeadingVectorLayer(map);
    });

    const updateScale = () => setScale(computeScale(map));
    map.on('move', updateScale);
    map.on('zoom', updateScale);
    map.on('load', updateScale);

    mapRef.current = map;

    // View-mode toggle uses display:none, which window.resize never sees.
    // Observe the container directly and nudge the map to recalculate.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
      ownShipMarkerRef.current = null;
      aisMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Own-ship marker (triple design) ─────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!self?.position || !isPlausiblePosition(self.position)) {
      ownShipMarkerRef.current?.remove();
      ownShipMarkerRef.current = null;
      return;
    }

    if (!ownShipMarkerRef.current) {
      const el = buildOwnShipElement();
      ownShipMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([self.position.longitude, self.position.latitude])
        .addTo(map);
    } else {
      ownShipMarkerRef.current.setLngLat([
        self.position.longitude,
        self.position.latitude,
      ]);
    }

    const headingDeg =
      self.cog != null && self.cog <= Math.PI * 2 ? (self.cog * 180) / Math.PI : 0;
    const triangle = ownShipMarkerRef.current
      .getElement()
      .querySelector<SVGSVGElement>('.own-ship-marker__triangle');
    if (triangle) triangle.style.transform = `rotate(${headingDeg}deg)`;
  }, [self?.position?.latitude, self?.position?.longitude, self?.cog]);

  // ── Heading vector (GeoJSON source + line layer) ────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    const source = map.getSource(HEADING_VECTOR_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    source.setData(buildHeadingVectorFeature(self));
  }, [self?.position?.latitude, self?.position?.longitude, self?.cog, self?.sog]);

  // ── AIS markers (threat-banded) ─────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const now = Date.now();
    const seen = new Set<string>();

    for (const v of targets) {
      if (!v.position || !isPlausiblePosition(v.position)) continue;
      seen.add(v.context);

      const isStale = now - v.lastUpdated > STALE_MS;
      const band = computeThreatBand(v, self, isStale);
      const hasHeading =
        v.cog != null && v.cog >= 0 && v.cog <= Math.PI * 2;

      let entry = aisMarkersRef.current.get(v.context);

      // Create or recreate (when shape changes between chevron/circle)
      if (!entry || entry.hasHeading !== hasHeading) {
        entry?.marker.remove();
        const el = buildAISElement(hasHeading);
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.position.longitude, v.position.latitude])
          .addTo(map);
        entry = { marker, hasHeading };
        aisMarkersRef.current.set(v.context, entry);
      } else {
        entry.marker.setLngLat([v.position.longitude, v.position.latitude]);
      }

      const el = entry.marker.getElement();
      el.className = [
        'ais-target-marker',
        `ais-target-marker--${band}`,
        isStale && 'ais-target-marker--stale',
      ]
        .filter(Boolean)
        .join(' ');

      if (hasHeading) {
        const svg = el.querySelector<SVGSVGElement>('svg');
        if (svg) {
          const deg = (v.cog! * 180) / Math.PI;
          svg.style.transform = `rotate(${deg}deg)`;
        }
      }
    }

    for (const [context, entry] of aisMarkersRef.current) {
      if (!seen.has(context)) {
        entry.marker.remove();
        aisMarkersRef.current.delete(context);
      }
    }
  }, [targets, self]);

  // ── Auto-recenter on own-ship position ──────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !self?.position || !isPlausiblePosition(self.position)) return;
    map.setCenter([self.position.longitude, self.position.latitude]);
  }, [self?.position?.latitude, self?.position?.longitude]);

  // ── Mode toggle: re-set the style; style.load conditionally re-applies overrides ──

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Only re-set if we've already loaded once — avoids double-init on mount.
    if (!styleLoadedRef.current) return;
    styleLoadedRef.current = false;
    map.setStyle(BASE_STYLE_URL);
    // After setStyle, style.load fires and applies marine overrides (if marine)
    // and re-adds the heading-vector source/layer.
  }, [mode]);

  // ── Manual recenter (button) ────────────────────────────────────────

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
      <ControlStack
        mode={mode}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onRecenter={handleRecenter}
        onModeToggle={() => setMode((m) => (m === 'marine' ? 'harbor' : 'marine'))}
      />
      {scale && <ScaleBar widthPx={scale.widthPx} label={scale.label} />}
    </div>
  );
}

// ── Map controls ──────────────────────────────────────────────────────

function ControlStack({
  mode,
  onZoomIn,
  onZoomOut,
  onRecenter,
  onModeToggle,
}: {
  mode: ChartMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onModeToggle: () => void;
}) {
  return (
    <div className="map-control-stack" role="group" aria-label="Map controls">
      <ControlButton onClick={onZoomIn} aria-label="Zoom in">+</ControlButton>
      <ControlButton onClick={onZoomOut} aria-label="Zoom out">−</ControlButton>
      <ControlButton onClick={onRecenter} aria-label="Recenter on own ship">⊙</ControlButton>
      <ControlButton
        onClick={onModeToggle}
        aria-label={mode === 'marine' ? 'Switch to harbor mode' : 'Switch to marine mode'}
        aria-pressed={mode === 'harbor'}
      >
        ⚓
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick,
  children,
  ...props
}: { onClick: () => void; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
>) {
  return (
    <button type="button" className="map-control-btn" onClick={onClick} {...props}>
      {children}
    </button>
  );
}

function ScaleBar({ widthPx, label }: { widthPx: number; label: string }) {
  return (
    <div className="map-scalebar" aria-label={`Map scale ${label}`}>
      <div className="map-scalebar__line" style={{ width: `${widthPx}px` }}>
        <span className="map-scalebar__tick map-scalebar__tick--left" aria-hidden="true" />
        <span className="map-scalebar__tick map-scalebar__tick--right" aria-hidden="true" />
      </div>
      <span className="map-scalebar__label">{label}</span>
    </div>
  );
}

// ── Scale calculation ────────────────────────────────────────────────

const NICE_NM = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

function computeScale(map: maplibregl.Map): { widthPx: number; label: string } {
  const lat = map.getCenter().lat;
  const zoom = map.getZoom();
  // Standard Web Mercator m/px at zoom z, latitude φ.
  const metersPerPixel =
    (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

  const targetPx = 130;
  const targetMeters = targetPx * metersPerPixel;
  const targetNm = targetMeters / 1852;

  // Pick the nearest "nice" round nm.
  let chosenNm = NICE_NM[NICE_NM.length - 1];
  let bestDelta = Infinity;
  for (const nm of NICE_NM) {
    const delta = Math.abs(nm - targetNm);
    if (delta < bestDelta) {
      bestDelta = delta;
      chosenNm = nm;
    }
  }

  const actualPx = (chosenNm * 1852) / metersPerPixel;
  const mi = chosenNm * 1.15078;
  const nmStr = chosenNm < 1 ? chosenNm.toFixed(2).replace(/0$/, '') : String(chosenNm);
  const miStr = mi < 1 ? mi.toFixed(2).replace(/0$/, '') : mi < 10 ? mi.toFixed(1) : String(Math.round(mi));
  return { widthPx: actualPx, label: `${nmStr} nm (${miStr} mi)` };
}

// ── DOM builders (SVG via createElementNS, no innerHTML) ──────────────

function buildOwnShipElement(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'own-ship-marker';

  const pulse = document.createElement('div');
  pulse.className = 'own-ship-marker__pulse';
  pulse.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'own-ship-marker__triangle');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M 20 4 L 34 36 L 20 28 L 6 36 Z');
  svg.appendChild(path);

  root.append(pulse, svg);
  return root;
}

function buildAISElement(hasHeading: boolean): HTMLDivElement {
  const root = document.createElement('div');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  if (hasHeading) {
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 8 1 L 14 14 L 8 11 L 2 14 Z');
    svg.appendChild(path);
  } else {
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '5');
    svg.appendChild(circle);
  }

  root.appendChild(svg);
  return root;
}

// ── Heading vector helpers ────────────────────────────────────────────

function ensureHeadingVectorLayer(map: maplibregl.Map): void {
  if (!map.getSource(HEADING_VECTOR_SOURCE)) {
    map.addSource(HEADING_VECTOR_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(HEADING_VECTOR_LAYER)) {
    map.addLayer({
      id: HEADING_VECTOR_LAYER,
      type: 'line',
      source: HEADING_VECTOR_SOURCE,
      paint: {
        'line-color': '#CCFF00',
        'line-width': 2,
      },
    });
  }
}

function buildHeadingVectorFeature(
  self: Vessel | undefined,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const empty: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: [],
  };

  if (!self?.position || !isPlausiblePosition(self.position)) return empty;
  if (self.cog == null || self.cog < 0 || self.cog > Math.PI * 2) return empty;
  if (self.sog == null || self.sog < 0.25 || self.sog > 60) return empty;

  const distanceM = self.sog * 60; // 1 minute of travel
  const end = projectPosition(self.position, self.cog, distanceM);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [self.position.longitude, self.position.latitude],
            [end.longitude, end.latitude],
          ],
        },
      },
    ],
  };
}
