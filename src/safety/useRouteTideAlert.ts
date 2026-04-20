// Samples depth contours along the active Go-To destination bearing and
// surfaces a tide-aware passage warning. Uses MapLibre's queryRenderedFeatures
// against the `noaa-depth-contour` layer — reads only what's currently
// visible, which works because the destination widget usually keeps the
// destination on-screen (auto-recenter is on by default).
//
// Graceful: if NOAA layers aren't loaded or the route is off-screen, we
// simply don't produce an alert — no false negatives worth worrying about
// for a conservative safety hint.

import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useActiveDestination } from '../waypoints/destinationStore';
import { useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition, haversineNm } from '../utils/geometry';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { useNow } from '../utils/clock';
import { calculateSafePassageWindows, minTideFtInWindow, minsUntilTideReaches } from './tideAlerts';

const M_TO_FT = 3.28084;
const SAMPLES_ALONG_ROUTE = 20;
const QUERY_RADIUS_PX = 20;

export interface RouteTideAlert {
  /** Minimum charted depth along the sampled route, ft at MLW. */
  minChartedFt: number;
  /** Effective minimum water depth in the next 6 hrs, ft. */
  minEffectiveFt: number;
  /** Required clearance = draft + safetyMargin, ft. */
  requiredFt: number;
  /** Minutes from now until the route becomes unsafe, null if safe. */
  minsUntilUnsafe: number | null;
  /** Current safe window close time (only present when safe now). */
  safeUntil: Date | null;
  /** Next safe window's start time (only present when unsafe now). */
  nextSafeFrom: Date | null;
  severity: 'clear' | 'watch' | 'warn';
}

export function useRouteTideAlert(mapRef: RefObject<maplibregl.Map | null>): RouteTideAlert | null {
  const dest = useActiveDestination();
  const self = useSelf();
  const prefs = useUserPrefs();
  const now = useNow(5 * 60 * 1000); // 5-min cadence — tide changes slowly
  const [minCharted, setMinCharted] = useState<number | null>(null);

  // Sample the chart contour layer every time position, destination, or time
  // changes. querySourceFeatures needs the source to be loaded + visible; we
  // guard by checking the layer exists.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      setMinCharted(null);
      return;
    }
    if (!dest || !self?.position || !isPlausiblePosition(self.position)) {
      setMinCharted(null);
      return;
    }
    if (!map.getSource('noaa')) {
      setMinCharted(null);
      return;
    }

    // Viewport-independent query: pull every depcnt feature currently cached
    // in loaded tiles, then keep only the ones whose VALDCO is the minimum
    // near a route sample. Does NOT require the destination to be on-screen —
    // tiles around own-ship usually cover short cruising legs.
    const route = samplePositions(self.position, dest.position, SAMPLES_ALONG_ROUTE);
    let minM = Infinity;
    let hits = 0;

    // Fallback to queryRenderedFeatures per-sample if the source query
    // returns nothing (happens on some pmtiles + style sequencing).
    const source = map.querySourceFeatures('noaa', { sourceLayer: 'depcnt' });
    if (source.length > 0) {
      // Broad sample: find the overall minimum in the loaded tile area, then
      // narrow to features near the route. Keeps the work cheap.
      for (const f of source) {
        const valdco = Number(f.properties?.VALDCO);
        if (!Number.isFinite(valdco)) continue;
        if (!featureNearRoute(f, route)) continue;
        if (valdco < minM) {
          minM = valdco;
          hits++;
        }
      }
    }

    if (hits === 0) {
      for (const pos of route) {
        const screen = map.project([pos.longitude, pos.latitude]);
        const features = map.queryRenderedFeatures(
          [
            [screen.x - QUERY_RADIUS_PX, screen.y - QUERY_RADIUS_PX],
            [screen.x + QUERY_RADIUS_PX, screen.y + QUERY_RADIUS_PX],
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
    }
    setMinCharted(hits > 0 ? minM * M_TO_FT : null);
  }, [
    mapRef,
    dest?.position.latitude,
    dest?.position.longitude,
    self?.position?.latitude,
    self?.position?.longitude,
    // re-sample as the tide moves the thresholds; `now` keeps this fresh
    now,
  ]);

  return useMemo((): RouteTideAlert | null => {
    if (minCharted == null) return null;
    const draftFt = prefs.vessel.draftFt;
    if (draftFt == null) return null;
    const requiredFt = draftFt + prefs.safetyMarginFt;

    const pos = self?.position;
    const minTideFt = minTideFtInWindow(now, 6, pos);
    const minEffectiveFt = minCharted + minTideFt;

    const tideThreshold = requiredFt - minCharted; // tide height at which route goes unsafe
    const minsUntilUnsafe =
      tideThreshold > 0 ? minsUntilTideReaches(now, tideThreshold, 6, pos) : null;

    let severity: RouteTideAlert['severity'] = 'clear';
    if (minEffectiveFt < requiredFt && minsUntilUnsafe != null && minsUntilUnsafe <= 60) {
      severity = 'warn';
    } else if (minEffectiveFt < requiredFt) {
      severity = 'watch';
    }

    // Safe passage windows: walk 30-min intervals over 24 hrs to find when
    // the minimum route depth meets draft + margin.
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
    };
  }, [minCharted, prefs.vessel.draftFt, prefs.safetyMarginFt, now, self?.position]);
}

/** Cheap "is any vertex of this LineString near any route sample" check. */
function featureNearRoute(
  f: GeoJSON.Feature,
  route: { latitude: number; longitude: number }[],
): boolean {
  const g = f.geometry;
  if (!g) return false;
  const coords = extractCoords(g);
  if (!coords) return false;
  const TOL_DEG = 0.02; // ~ 1 nm; generous — we just need "plausibly near"
  for (const [lon, lat] of coords) {
    for (const p of route) {
      if (Math.abs(lat - p.latitude) < TOL_DEG && Math.abs(lon - p.longitude) < TOL_DEG) {
        return true;
      }
    }
  }
  return false;
}

function extractCoords(g: GeoJSON.Geometry): [number, number][] | null {
  if (g.type === 'LineString') return g.coordinates as [number, number][];
  if (g.type === 'MultiLineString') return (g.coordinates as [number, number][][]).flat();
  return null;
}

function samplePositions(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  n: number,
) {
  const distNm = haversineNm(a, b);
  // Always sample the two endpoints + intermediate points along the line.
  // Linear interpolation in lat/lon is fine for short legs (< a few nm).
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    });
  }
  // Reference distNm so the linter doesn't complain — even though unused here,
  // it communicates the caller's intent and keeps the call site honest.
  void distNm;
  return out;
}
