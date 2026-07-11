// Tide-aware passage check for the active Go-To destination. Samples
// charted depth along the route via MapLibre's source + rendered features,
// then combines with the 6-hr tide window to surface a severity-graded
// alert. Quantized to ~100 m so the effect doesn't re-run on every
// SignalK tick.

import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useActiveRoute } from '../waypoints/routeStore';
import { useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition, samplePolyline } from '../utils/geometry';
import { metersToFeet } from '../utils/units';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { useNow } from '../utils/clock';
import { tidesAuthoritative } from '../utils/tides';
import { calculateSafePassageWindows, minTideFtInWindow, minsUntilTideReaches } from './tideAlerts';

const SAMPLES_ALONG_ROUTE = 20;
const QUERY_RADIUS_PX = 20;

export interface RouteTideAlert {
  minChartedFt: number;
  minEffectiveFt: number;
  requiredFt: number;
  minsUntilUnsafe: number | null;
  safeUntil: Date | null;
  nextSafeFrom: Date | null;
  severity: 'clear' | 'watch' | 'warn';
  /** True when no authoritative tide data covers the window. The numbers are
   *  then charted-depth only (no tide shift, no timing) and the UI must say
   *  "tide unknown" rather than present live-water figures. */
  tideIsEstimate: boolean;
}

export function useRouteTideAlert(mapRef: RefObject<maplibregl.Map | null>): RouteTideAlert | null {
  const activeRoute = useActiveRoute();
  const self = useSelf();
  const prefs = useUserPrefs();
  const now = useNow(5 * 60 * 1000);
  const [minCharted, setMinCharted] = useState<number | null>(null);

  // Quantize to ~0.001° (~100 m) so GPS jitter doesn't re-fire the sampling
  // effect on every 1 Hz tick. Waypoint coords are user-set (stable).
  const selfLatQ = self?.position ? Math.round(self.position.latitude * 1000) : null;
  const selfLonQ = self?.position ? Math.round(self.position.longitude * 1000) : null;
  // Fingerprint the waypoint sequence so any change (append, remove,
  // reorder) triggers a resample — but identical reference doesn't.
  const waypointsKey = activeRoute
    ? activeRoute.waypoints
        .map((w) => `${w.position.latitude.toFixed(4)},${w.position.longitude.toFixed(4)}`)
        .join('|')
    : '';

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !activeRoute ||
      activeRoute.waypoints.length === 0 ||
      !self?.position ||
      !isPlausiblePosition(self.position)
    ) {
      setMinCharted(null);
      return;
    }
    if (!map.getSource('noaa')) {
      setMinCharted(null);
      return;
    }

    const polyline = [self.position, ...activeRoute.waypoints.map((w) => w.position)];
    const route = samplePolyline(polyline, SAMPLES_ALONG_ROUTE);
    let minM = Infinity;
    let hits = 0;

    // Viewport-independent path: scan all depcnt features from loaded tiles,
    // keep those near any route sample. Falls through to queryRenderedFeatures
    // with a route-spanning bbox if nothing hits — covers pmtiles/style
    // sequencing quirks.
    for (const f of map.querySourceFeatures('noaa', { sourceLayer: 'depcnt' })) {
      const valdco = Number(f.properties?.VALDCO);
      if (!Number.isFinite(valdco) || valdco >= minM) continue;
      if (!featureNearRoute(f, route)) continue;
      minM = valdco;
      hits++;
    }

    if (hits === 0) {
      // Single bbox query covering the whole route — one paint read instead
      // of 20. Still viewport-limited, but cheap and correct when on-screen.
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const pos of route) {
        const p = map.project([pos.longitude, pos.latitude]);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const features = map.queryRenderedFeatures(
        [
          [minX - QUERY_RADIUS_PX, minY - QUERY_RADIUS_PX],
          [maxX + QUERY_RADIUS_PX, maxY + QUERY_RADIUS_PX],
        ],
        { layers: ['noaa-depth-contour'] },
      );
      for (const f of features) {
        const valdco = Number(f.properties?.VALDCO);
        if (Number.isFinite(valdco) && valdco < minM) {
          minM = valdco;
          hits++;
        }
      }
    }

    setMinCharted(hits > 0 ? metersToFeet(minM) : null);
    // Deliberate stand-ins: waypointsKey fingerprints activeRoute; the
    // quantized lat/lon (~100 m) stand in for self.position so GPS jitter
    // doesn't re-run the tile scan at 1 Hz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, waypointsKey, selfLatQ, selfLonQ, now]);

  return useMemo((): RouteTideAlert | null => {
    if (minCharted == null) return null;
    const draftFt = prefs.vessel.draftFt;
    if (draftFt == null) return null;
    const requiredFt = draftFt + prefs.safetyMarginFt;

    // Quantized position (~100 m) — plenty for tide-station selection, and it
    // keeps this memo from recomputing the 48-step window scan at 1 Hz.
    const pos =
      selfLatQ != null && selfLonQ != null
        ? { latitude: selfLatQ / 1000, longitude: selfLonQ / 1000 }
        : undefined;

    // No authoritative tide data → charted-depth-only assessment. Stub tide
    // numbers must not produce live-water figures or "safe until 4 PM" times.
    if (!tidesAuthoritative(now, new Date(now.getTime() + 6 * 3600_000), pos)) {
      return {
        minChartedFt: minCharted,
        minEffectiveFt: minCharted,
        requiredFt,
        minsUntilUnsafe: null,
        safeUntil: null,
        nextSafeFrom: null,
        severity: minCharted < requiredFt ? 'watch' : 'clear',
        tideIsEstimate: true,
      };
    }

    const minTideFt = minTideFtInWindow(now, 6, pos);
    const minEffectiveFt = minCharted + minTideFt;

    const tideThreshold = requiredFt - minCharted;
    const minsUntilUnsafe =
      tideThreshold > 0 ? minsUntilTideReaches(now, tideThreshold, 6, pos) : null;

    let severity: RouteTideAlert['severity'] = 'clear';
    if (minEffectiveFt < requiredFt && minsUntilUnsafe != null && minsUntilUnsafe <= 60) {
      severity = 'warn';
    } else if (minEffectiveFt < requiredFt) {
      severity = 'watch';
    }

    const windows = calculateSafePassageWindows(now, minCharted, requiredFt, 24, 30, pos);
    const safeUntil = windows.find((w) => w.start.getTime() <= now.getTime())?.end ?? null;
    const nextSafeFrom = windows.find((w) => w.start.getTime() > now.getTime())?.start ?? null;

    return {
      minChartedFt: minCharted,
      minEffectiveFt,
      requiredFt,
      minsUntilUnsafe,
      safeUntil,
      nextSafeFrom,
      severity,
      tideIsEstimate: false,
    };
  }, [minCharted, prefs.vessel.draftFt, prefs.safetyMarginFt, now, selfLatQ, selfLonQ]);
}

function featureNearRoute(
  f: GeoJSON.Feature,
  route: { latitude: number; longitude: number }[],
): boolean {
  const coords = extractCoords(f.geometry);
  if (!coords) return false;
  const TOL_DEG = 0.02; // ~1 nm; generous enough for "plausibly on route"
  for (const [lon, lat] of coords) {
    for (const p of route) {
      if (Math.abs(lat - p.latitude) < TOL_DEG && Math.abs(lon - p.longitude) < TOL_DEG) {
        return true;
      }
    }
  }
  return false;
}

function extractCoords(g: GeoJSON.Geometry | null): [number, number][] | null {
  if (!g) return null;
  if (g.type === 'LineString') return g.coordinates as [number, number][];
  if (g.type === 'MultiLineString') return (g.coordinates as [number, number][][]).flat();
  return null;
}
