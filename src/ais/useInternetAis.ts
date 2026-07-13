// App-level service hook for the internet-AIS shore relay (aisstream.io).
// Mounted in AppServices; runs when the operator enabled it in Settings and
// entered an API key. Feeds relayed deltas into the same bounded ingest store
// the primary client uses — targets get the `relayed` trust cap there.
//
// Never runs in mock mode: the dev fleet stays hermetic. In geo/real modes
// this is real (if delayed) data, so it does not violate the "no simulated
// data on the water" rule — the honesty treatment is the labeling + monitor
// cap, plus the connection status readout in the AIS list (an empty list
// while the relay is offline must not read as "no traffic").

import { useEffect } from 'react';
import { defineMemoryStore } from '../storage/localStore';
import { startAisStream, type AisStreamStatus } from '../signalk/aisStream';
import { SIGNALK_MODE } from '../signalk/client';
import { ingestRelayedDelta, useSelf } from '../signalk/useSignalK';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { FALLBACK_POS, validPosition } from '../utils/geometry';

/** 'off' = disabled in Settings (or mock mode) — the UI shows nothing. */
export type InternetAisStatus = AisStreamStatus | 'off';

const statusStore = defineMemoryStore<InternetAisStatus>('off');

export function useInternetAisStatus(): InternetAisStatus {
  return statusStore.use();
}

export function useInternetAis(): void {
  const prefs = useUserPrefs();
  const self = useSelf();

  const apiKey = prefs.internetAis.apiKey.trim();
  const enabled = prefs.internetAis.enabled && apiKey.length > 0 && SIGNALK_MODE !== 'mock';

  // Quantize the subscription center to 0.25° (~15 nm) so GPS ticks don't
  // churn the connection — the subscription box is ±0.75°/±1.0°, so a
  // re-center this coarse still keeps own-ship comfortably inside it.
  // Before the first fix, subscribe around mid-coast Maine (home waters);
  // the box re-centers on the first quantized fix.
  const pos = validPosition(self) ?? FALLBACK_POS;
  const latQ = Math.round(pos.latitude * 4) / 4;
  const lonQ = Math.round(pos.longitude * 4) / 4;

  useEffect(() => {
    if (!enabled) {
      statusStore.set('off');
      return;
    }
    const stop = startAisStream({
      apiKey,
      center: { latitude: latQ, longitude: lonQ },
      onDelta: ingestRelayedDelta,
      onStatus: (s) => statusStore.set(s),
    });
    return () => {
      stop();
      statusStore.set('off');
    };
  }, [enabled, apiKey, latQ, lonQ]);
}
