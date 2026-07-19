// Internet AIS via aisstream.io — a WebSocket relay of what volunteer SHORE
// stations hear. Supplementary source for boats with no AIS receiver aboard
// (the phone build with cellular data).
//
// TRUST MODEL — this is real data, but second-hand and delayed:
//   - Positions can be seconds to minutes old (Class B boats transmit every
//     ~30 s at best; aggregation adds more). A target shown mid-channel may
//     have moved a quarter mile.
//   - Coverage is whatever shore stations exist — an empty feed can mean "no
//     traffic" OR "no station hears this cove," and you can't tell which.
// Consumers therefore treat relayed vessels conservatively: threat banding
// caps them at 'monitor' (never a danger warning off a stale position) and
// the AIS list labels them "via shore relay." See CLAUDE.md, "Bad data never
// drives warnings."
//
// Protocol: connect wss://stream.aisstream.io/v0/stream, send one JSON
// subscription {APIKey, BoundingBoxes, FilterMessageTypes}, then receive one
// JSON message per AIS report. Free API key from aisstream.io — entered by
// the operator in Settings, stored locally on the device.

import type { SignalKDelta } from './types';
import { knotsToMs } from '../utils/units';
import { degToRad } from '../utils/angles';
import type { Position } from './types';

const STREAM_URL = 'wss://stream.aisstream.io/v0/stream';

// Subscription box around own position: ±0.75° lat / ±1.0° lon ≈ 45 nm N-S
// and ≈ 42 nm E-W at 44°N — generous enough that the hook only needs to
// resubscribe after a long passage, small enough to keep message volume sane.
const BOX_HALF_LAT_DEG = 0.75;
const BOX_HALF_LON_DEG = 1.0;

// AIS wire sentinels for "not available" (ITU-R M.1371).
const SOG_UNAVAILABLE_KN = 102.3;
const COG_UNAVAILABLE_DEG = 360;

/** `rejected` = the service refused the subscription (bad API key, malformed
 *  box). Deterministic — retrying the same subscription fails the same way —
 *  so the client stops reconnecting until Settings change restarts it. */
export type AisStreamStatus = 'connecting' | 'connected' | 'offline' | 'rejected';

export interface AisStreamOptions {
  apiKey: string;
  /** Subscription center — a fresh connection subscribes around this point. */
  center: Position;
  onDelta: (delta: SignalKDelta) => void;
  onStatus: (status: AisStreamStatus) => void;
}

/**
 * Open the aisstream.io feed and pump converted deltas until the returned
 * stop function is called. Reconnects with capped exponential backoff
 * (2 s → 60 s) — cellular coverage comes and goes on the water, so `offline`
 * is a routine state, not an error.
 */
export function startAisStream({
  apiKey,
  center,
  onDelta,
  onStatus,
}: AisStreamOptions): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let rejected = false;
  let backoffMs = 2000;

  const scheduleReconnect = () => {
    if (closed || rejected) return;
    onStatus('offline');
    reconnectTimer = setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 60_000);
  };

  const connect = () => {
    if (closed) return;
    onStatus('connecting');
    try {
      ws = new WebSocket(STREAM_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      backoffMs = 2000;
      onStatus('connected');
      // aisstream expects [[lat, lon] SW, [lat, lon] NE] boxes.
      ws?.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [
            [
              [center.latitude - BOX_HALF_LAT_DEG, center.longitude - BOX_HALF_LON_DEG],
              [center.latitude + BOX_HALF_LAT_DEG, center.longitude + BOX_HALF_LON_DEG],
            ],
          ],
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }),
      );
    };
    ws.onmessage = (ev) => {
      let raw: unknown;
      try {
        raw = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return; // non-JSON frame — ignore
      }
      // aisstream answers a refused subscription with {"error": "..."} and
      // then closes. Without this branch that close is indistinguishable
      // from a coverage drop and gets mislabeled "no cell signal" — a
      // mistyped API key must say so instead.
      if (isErrorFrame(raw)) {
        rejected = true;
        onStatus('rejected');
        console.warn(`aisstream.io rejected the subscription: ${raw.error}`);
        return;
      }
      const delta = aisStreamMessageToDelta(raw);
      if (delta) onDelta(delta);
    };
    ws.onclose = scheduleReconnect;
    ws.onerror = () => ws?.close();
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}

function isErrorFrame(raw: unknown): raw is { error: string } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as { error?: unknown }).error === 'string'
  );
}

// ── Message conversion (pure — unit-tested) ────────────────────────────

interface AisStreamMessage {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string };
  Message?: {
    PositionReport?: {
      Latitude?: number;
      Longitude?: number;
      Sog?: number; // knots
      Cog?: number; // degrees
      NavigationalStatus?: number;
    };
    ShipStaticData?: { Name?: string };
  };
}

/** AIS navigational status (ITU-R M.1371) → the navState strings the
 *  narrative layer already understands. Unmapped codes are omitted. */
const NAV_STATUS: Record<number, string> = {
  0: 'underway',
  1: 'at anchor',
  5: 'moored',
};

/**
 * Convert one aisstream.io message into a SignalK delta, or null if the
 * message carries nothing usable. Unit conversions happen HERE, at the
 * source (project rule): AIS wire speed is knots → m/s; course is degrees →
 * radians. Wire sentinels (SOG 102.3 kn, COG 360°) are dropped, not passed
 * through. No timestamp is attached — the ingest store stamps arrival time,
 * which is the honest "last heard via shore" for a relayed report.
 */
export function aisStreamMessageToDelta(raw: unknown): SignalKDelta | null {
  const msg = raw as AisStreamMessage;
  if (!msg || typeof msg !== 'object') return null;

  const mmsi = msg.MetaData?.MMSI;
  if (typeof mmsi !== 'number' || !Number.isInteger(mmsi) || mmsi <= 0) return null;

  const values: { path: string; value: unknown }[] = [];
  const name = cleanShipName(msg.MetaData?.ShipName);

  if (msg.MessageType === 'PositionReport') {
    const report = msg.Message?.PositionReport;
    if (!report) return null;
    const { Latitude: lat, Longitude: lon } = report;
    // A position report without a finite position is useless — drop it
    // rather than emit a positionless ghost row.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    values.push({ path: 'navigation.position', value: { latitude: lat, longitude: lon } });

    const sog = report.Sog;
    if (typeof sog === 'number' && Number.isFinite(sog) && sog >= 0 && sog < SOG_UNAVAILABLE_KN) {
      values.push({ path: 'navigation.speedOverGround', value: knotsToMs(sog) });
    }
    const cog = report.Cog;
    if (typeof cog === 'number' && Number.isFinite(cog) && cog >= 0 && cog < COG_UNAVAILABLE_DEG) {
      values.push({ path: 'navigation.courseOverGroundTrue', value: degToRad(cog) });
    }
    const navState = NAV_STATUS[report.NavigationalStatus ?? -1];
    if (navState) values.push({ path: 'navigation.state', value: navState });
    if (name) values.push({ path: 'name', value: name });
  } else if (msg.MessageType === 'ShipStaticData') {
    const staticName = cleanShipName(msg.Message?.ShipStaticData?.Name) ?? name;
    if (!staticName) return null;
    values.push({ path: 'name', value: staticName });
  } else {
    return null;
  }

  if (values.length === 0) return null;
  return {
    context: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
    updates: [{ values }],
  };
}

/** AIS names come space/'@'-padded off the wire ("LUCKY CATCH@@@  "). */
function cleanShipName(name: string | undefined): string | undefined {
  if (typeof name !== 'string') return undefined;
  const cleaned = name.replace(/@/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
