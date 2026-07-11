// Continuously records own-ship positions into the breadcrumb store.
// Downsampled: append only when THROTTLE_MS elapsed AND the boat has moved
// MIN_MOVE_M since the last breadcrumb — a steady 30 s cadence while underway,
// nothing while moored. (An OR here made the distance gate fire every ~4 s at
// cruising speed, rewriting the whole store to localStorage each time.)
// Plausibility checks prevent noise points from bad fixes.

import { useEffect, useRef } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition, haversineNm } from '../utils/geometry';
import { appendBreadcrumb, readBreadcrumbs } from './breadcrumbStore';

const THROTTLE_MS = 30_000; // 30 s minimum between appends
const MIN_MOVE_NM = 0.005; // ~9 m — suppresses idle drift while moored

export function useBreadcrumbRecorder(): void {
  const self = useSelf();
  const lastAppendAtRef = useRef(0);

  useEffect(() => {
    if (!self?.position || !isPlausiblePosition(self.position)) return;

    const now = Date.now();
    const timeOk = now - lastAppendAtRef.current >= THROTTLE_MS;

    // Distance guard: also skip if we haven't moved.
    const history = readBreadcrumbs();
    const last = history[history.length - 1];
    const distOk = !last
      ? true
      : haversineNm(
          { latitude: last.lat, longitude: last.lon },
          { latitude: self.position.latitude, longitude: self.position.longitude },
        ) >= MIN_MOVE_NM;

    if (!timeOk || !distOk) return;

    appendBreadcrumb({
      lat: self.position.latitude,
      lon: self.position.longitude,
      t: now,
      sogMs: self.sog,
    });
    lastAppendAtRef.current = now;
    // Granular deps: self is copy-on-write per delta; we only react to fix changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.position?.latitude, self?.position?.longitude, self?.lastUpdated]);
}
