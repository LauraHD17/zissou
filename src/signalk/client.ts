import type { SignalKDelta } from './types';
import { startMockStream } from './mockData';

export type DeltaHandler = (delta: SignalKDelta) => void;

export interface SignalKClient {
  subscribe(handler: DeltaHandler): () => void;
  close(): void;
}

const MODE = (import.meta.env.VITE_SIGNALK_MODE ?? 'mock') as 'mock' | 'real';
const URL =
  import.meta.env.VITE_SIGNALK_URL ?? 'ws://localhost:3000/signalk/v1/stream?subscribe=all';

export function createSignalKClient(): SignalKClient {
  return MODE === 'real' ? createRealClient(URL) : createMockClient();
}

function createRealClient(url: string): SignalKClient {
  const handlers = new Set<DeltaHandler>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(url);
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
    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, 2000);
    };
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
