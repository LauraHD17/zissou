// SignalK delta message shape as streamed over WebSocket.
// See: https://signalk.org/specification/1.7.0/doc/data_model.html

export interface SignalKDelta {
  context: string;
  updates: SignalKUpdate[];
}

export interface SignalKUpdate {
  timestamp?: string;
  source?: { label?: string; type?: string };
  values: SignalKValue[];
}

export interface SignalKValue {
  path: string;
  value: unknown;
}

export interface Position {
  latitude: number;
  longitude: number;
}

// Derived per-vessel record the UI actually renders.
export interface Vessel {
  context: string;
  mmsi?: string;
  name?: string;
  position?: Position;
  sog?: number;
  cog?: number;
  heading?: number;
  shipType?: string | number;
  navState?: string;
  lastUpdated: number;
  paths: Record<string, unknown>;
}
