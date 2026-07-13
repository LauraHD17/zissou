import type { SignalKDelta } from './types';
import { startMockStream } from './mockData';

export type DeltaHandler = (delta: SignalKDelta) => void;

export interface SignalKClient {
  subscribe(handler: DeltaHandler): () => void;
  close(): void;
}

// Three client modes:
//   mock — laptop development only; synthetic vessels from mockData.ts
//   real — SignalK server over WebSocket (the Pi)
//   geo  — the device's own GPS via the browser Geolocation API (phone
//          builds). REAL DATA ONLY: no mock AIS traffic ever runs in this
//          mode — an empty AIS list is the honest state for a phone with
//          no AIS receiver. Requires a secure (HTTPS) origin on iOS.
const MODE = (import.meta.env.VITE_SIGNALK_MODE ?? 'mock') as 'mock' | 'real' | 'geo';
// Exported for the internet-AIS relay gate: the supplementary shore feed runs
// in the on-water modes (geo/real) but never in mock — the mock fleet stays
// hermetic and dev runs don't burn the aisstream connection.
export const SIGNALK_MODE = MODE;
const URL =
  import.meta.env.VITE_SIGNALK_URL ?? 'ws://localhost:3000/signalk/v1/stream?subscribe=all';

export function createSignalKClient(): SignalKClient {
  if (MODE === 'real') return createRealClient(URL);
  if (MODE === 'geo') return createGeoClient();
  return createMockClient();
}

/**
 * Feeds the device's own GPS into the same delta shape the reducer already
 * understands, as vessels.self. Geolocation units: coords.speed is m/s
 * (matches SignalK SOG); coords.heading is DEGREES true and must be
 * converted to radians (SignalK spec unit, validated by isValidCogRad) —
 * heading is null/NaN when stationary, in which case COG is simply omitted.
 */
function createGeoClient(): SignalKClient {
  const handlers = new Set<DeltaHandler>();
  let watchId: number | null = null;

  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (fix) => {
        const values: { path: string; value: unknown }[] = [
          {
            path: 'navigation.position',
            value: { latitude: fix.coords.latitude, longitude: fix.coords.longitude },
          },
        ];
        if (fix.coords.speed != null && Number.isFinite(fix.coords.speed)) {
          values.push({ path: 'navigation.speedOverGround', value: fix.coords.speed });
        }
        if (fix.coords.heading != null && Number.isFinite(fix.coords.heading)) {
          values.push({
            path: 'navigation.courseOverGroundTrue',
            value: (fix.coords.heading * Math.PI) / 180,
          });
        }
        const delta: SignalKDelta = {
          context: 'vessels.self',
          updates: [{ timestamp: new Date(fix.timestamp).toISOString(), values }],
        };
        handlers.forEach((h) => h(delta));
      },
      () => {
        // Permission denied or no fix yet — say nothing; the StatusBar's
        // "no fix" state is the honest signal, same as a dead GPS dongle.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }

  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      handlers.clear();
    },
  };
}

function createRealClient(url: string): SignalKClient {
  const handlers = new Set<DeltaHandler>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  // Capped exponential backoff: 2 s → 30 s. The server is usually localhost,
  // but if it's down for hours a flat 2 s retry is a pointless wakeup churn.
  let backoffMs = 2000;

  const scheduleReconnect = () => {
    if (closed) return;
    reconnectTimer = setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      // Malformed URL or constructor failure — retry like a dropped socket
      // instead of dying silently with no reconnect path.
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      backoffMs = 2000;
    };
    ws.onmessage = (ev) => {
      try {
        const delta = JSON.parse(ev.data) as SignalKDelta;
        if (delta && Array.isArray(delta.updates)) {
          handlers.forEach((h) => h(delta));
        }
      } catch {
        // Server sometimes emits hello/status frames that aren't deltas — ignore.
      }
    };
    ws.onclose = scheduleReconnect;
    ws.onerror = () => ws?.close();
  };

  connect();

  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

function createMockClient(): SignalKClient {
  const handlers = new Set<DeltaHandler>();
  const stop = startMockStream((delta) => handlers.forEach((h) => h(delta)));
  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      stop();
    },
  };
}
