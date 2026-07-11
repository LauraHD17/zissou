// Owns the MapLibre map lifecycle: creation/teardown, pmtiles protocol,
// style.load re-application, container resize, and the auto-recenter /
// free-pan ("following") interaction. ChartCanvas stays a composition root.

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import type { MutableRefObject, RefObject } from 'react';
import { CachedChartSource } from '../style/chartSource';
import { CHART_FILES, chartUrl } from '../style/chartUrls';
import type { Vessel } from '../../signalk/types';
import { isPlausiblePosition } from '../../utils/geometry';
import { applyMarineStyle } from '../style/marineStyle';
import { buildOfflineStyle } from '../style/offlineStyle';
import { ensureHeadingVectorLayer } from '../markers/HeadingVector';
import { ensureGoToRouteLayer } from '../markers/GoToRoute';
import { ensureAnchorCircleLayers } from '../markers/AnchorCircle';
import type { ChartMode } from './useChartMode';

const FALLBACK_CENTER: [number, number] = [-68.8, 44.4]; // [lng, lat] mid-coast Maine
export const DEFAULT_ZOOM = 12;

// Idempotent: pmtiles:// protocol only needs to be registered once per page.
// Each chart file gets a CachedChartSource-backed PMTiles instance keyed by
// its URL, so the style's pmtiles://<url> references read from the chunked
// offline cache when present and fall back to HTTP ranges when not.
let pmtilesProtocolRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesProtocolRegistered) return;
  const protocol = new Protocol();
  for (const f of CHART_FILES) {
    protocol.add(new PMTiles(new CachedChartSource(chartUrl(f))));
  }
  maplibregl.addProtocol('pmtiles', protocol.tile);
  pmtilesProtocolRegistered = true;
}

interface Args {
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  styleLoadedRef: MutableRefObject<boolean>;
  modeRef: RefObject<ChartMode>;
  self: Vessel | undefined;
}

export function useMapInstance({ containerRef, mapRef, styleLoadedRef, modeRef, self }: Args) {
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
      style: buildOfflineStyle(),
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
    // Init runs once; auto-recenter handles position updates. modeRef,
    // mapRef, styleLoadedRef, containerRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !following) return;
    if (!self?.position || !isPlausiblePosition(self.position)) return;
    map.setCenter([self.position.longitude, self.position.latitude]);
    // Granular deps: self is copy-on-write per delta; we only read position lat/lon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { following, handleRecenter };
}
