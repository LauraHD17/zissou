import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useAISTargets, useSelf } from '../signalk/useSignalK';
import { computeThreatBand, isPlausiblePosition, projectPosition } from '../utils/formatters';
import type { Vessel } from '../signalk/types';
import { BASE_STYLE_URL, applyMarineStyle } from '../chart/marineStyle';

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
      applyMarineStyle(map);
      ensureHeadingVectorLayer(map);
    });

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

  return <div ref={containerRef} className="chart-map" />;
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
