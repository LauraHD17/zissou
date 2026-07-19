import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aisStreamMessageToDelta, startAisStream, type AisStreamStatus } from './aisStream';
import { knotsToMs } from '../utils/units';

const MMSI = 368045130;

function positionReport(over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  return {
    MessageType: 'PositionReport',
    MetaData: { MMSI, ShipName: 'LUCKY CATCH@@@  ', ...meta },
    Message: {
      PositionReport: {
        Latitude: 44.35,
        Longitude: -68.9,
        Sog: 5.6,
        Cog: 235.0,
        NavigationalStatus: 0,
        ...over,
      },
    },
  };
}

function pathValue(
  delta: { updates: { values: { path: string; value: unknown }[] }[] },
  path: string,
) {
  return delta.updates[0].values.find((v) => v.path === path)?.value;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

describe('startAisStream — connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function start() {
    const statuses: AisStreamStatus[] = [];
    const stop = startAisStream({
      apiKey: 'test-key',
      center: { latitude: 44.1, longitude: -68.8 },
      onDelta: () => {},
      onStatus: (s) => statuses.push(s),
    });
    return { statuses, stop };
  }

  it('subscribes with the API key on open and reports connected', () => {
    const { statuses, stop } = start();
    const ws = FakeWebSocket.instances[0];
    ws.onopen!();
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(JSON.parse(ws.sent[0]).APIKey).toBe('test-key');
    stop();
  });

  it('reconnects after a plain close (coverage drop) with backoff', () => {
    const { statuses, stop } = start();
    FakeWebSocket.instances[0].onclose!();
    expect(statuses).toEqual(['connecting', 'offline']);
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    stop();
  });

  it('reports rejected on an {"error": ...} frame and stops reconnecting', () => {
    const { statuses, stop } = start();
    const ws = FakeWebSocket.instances[0];
    ws.onopen!();
    ws.onmessage!({ data: JSON.stringify({ error: 'Api Key Is Not Valid' }) });
    ws.onclose!(); // server closes after the error frame
    expect(statuses).toEqual(['connecting', 'connected', 'rejected']);
    // A bad key can't fix itself — no reconnect churn against the service.
    vi.advanceTimersByTime(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    stop();
  });
});

describe('aisStreamMessageToDelta — position reports', () => {
  it('converts a full report with SignalK units and mmsi context', () => {
    const delta = aisStreamMessageToDelta(positionReport());
    expect(delta).not.toBeNull();
    expect(delta!.context).toBe(`vessels.urn:mrn:imo:mmsi:${MMSI}`);
    expect(pathValue(delta!, 'navigation.position')).toEqual({
      latitude: 44.35,
      longitude: -68.9,
    });
    // Wire knots → m/s, wire degrees → radians (SignalK spec units).
    expect(pathValue(delta!, 'navigation.speedOverGround')).toBeCloseTo(knotsToMs(5.6), 10);
    expect(pathValue(delta!, 'navigation.courseOverGroundTrue')).toBeCloseTo(
      (235 * Math.PI) / 180,
      10,
    );
    expect(pathValue(delta!, 'navigation.state')).toBe('underway');
    // '@' padding stripped from the wire name.
    expect(pathValue(delta!, 'name')).toBe('LUCKY CATCH');
    // No wire timestamp — ingest stamps arrival time for relayed reports.
    expect(delta!.updates[0].timestamp).toBeUndefined();
  });

  it('drops the AIS "not available" sentinels instead of passing them through', () => {
    const delta = aisStreamMessageToDelta(positionReport({ Sog: 102.3, Cog: 360 }));
    expect(pathValue(delta!, 'navigation.speedOverGround')).toBeUndefined();
    expect(pathValue(delta!, 'navigation.courseOverGroundTrue')).toBeUndefined();
    // Position still delivered.
    expect(pathValue(delta!, 'navigation.position')).toBeDefined();
  });

  it('maps anchored and moored nav statuses; omits unmapped codes', () => {
    expect(
      pathValue(
        aisStreamMessageToDelta(positionReport({ NavigationalStatus: 1 }))!,
        'navigation.state',
      ),
    ).toBe('at anchor');
    expect(
      pathValue(
        aisStreamMessageToDelta(positionReport({ NavigationalStatus: 5 }))!,
        'navigation.state',
      ),
    ).toBe('moored');
    expect(
      pathValue(
        aisStreamMessageToDelta(positionReport({ NavigationalStatus: 15 }))!,
        'navigation.state',
      ),
    ).toBeUndefined();
  });

  it('rejects a report with a non-finite position — no positionless ghosts', () => {
    expect(aisStreamMessageToDelta(positionReport({ Latitude: NaN }))).toBeNull();
    expect(aisStreamMessageToDelta(positionReport({ Longitude: undefined }))).toBeNull();
  });
});

describe('aisStreamMessageToDelta — static data + garbage', () => {
  it('converts static data to a name-only delta', () => {
    const delta = aisStreamMessageToDelta({
      MessageType: 'ShipStaticData',
      MetaData: { MMSI },
      Message: { ShipStaticData: { Name: 'ELLA MAY@@' } },
    });
    expect(delta!.context).toBe(`vessels.urn:mrn:imo:mmsi:${MMSI}`);
    expect(pathValue(delta!, 'name')).toBe('ELLA MAY');
  });

  it('rejects messages without a usable MMSI', () => {
    expect(aisStreamMessageToDelta(positionReport({}, { MMSI: undefined }))).toBeNull();
    expect(aisStreamMessageToDelta(positionReport({}, { MMSI: -5 }))).toBeNull();
    expect(aisStreamMessageToDelta(positionReport({}, { MMSI: 3.14 }))).toBeNull();
  });

  it('rejects unknown message types, non-objects, and empty static names', () => {
    expect(aisStreamMessageToDelta({ MessageType: 'AidsToNavigationReport' })).toBeNull();
    expect(aisStreamMessageToDelta(null)).toBeNull();
    expect(aisStreamMessageToDelta('garbage')).toBeNull();
    expect(
      aisStreamMessageToDelta({
        MessageType: 'ShipStaticData',
        MetaData: { MMSI },
        Message: { ShipStaticData: { Name: '@@@  ' } },
      }),
    ).toBeNull();
  });
});
