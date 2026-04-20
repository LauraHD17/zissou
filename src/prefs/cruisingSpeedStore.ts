// Auto-detected cruising speed. Samples SOG whenever the boat is actually
// moving (2 < sog < 15 kn filters out docking/idling/planing noise), keeps a
// ring buffer of N samples, and exposes the median as the detected value.
//
// Persisted so the detection warms up across sessions. The user can override
// in Settings; `resolveCruisingSpeed()` returns override > detected > default.

import { defineStore } from '../storage/localStore';

const MAX_SAMPLES = 500;
const DEFAULT_CRUISING_KN = 6;

interface Snapshot {
  samples: number[]; // knots, newest last
}

const store = defineStore<Snapshot>('nav.cruisingSpeed.v1', 1, { samples: [] });

export function useCruisingSpeedSamples(): number[] {
  return store.use().samples;
}

export function readCruisingSpeedSamples(): number[] {
  return store.read().samples;
}

export function appendCruisingSpeedSample(knots: number): void {
  if (!Number.isFinite(knots) || knots < 2 || knots > 15) return;
  store.update((prev) => {
    const next = [...prev.samples, knots];
    if (next.length > MAX_SAMPLES) next.splice(0, next.length - MAX_SAMPLES);
    return { samples: next };
  });
}

export function computeDetectedCruisingKn(samples: number[]): number | null {
  if (samples.length < 10) return null; // need a warm-up before we trust it
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Final cruising speed to use: explicit override > auto-detected > default. */
export function resolveCruisingSpeedKn(
  override: number | undefined,
  detected: number | null,
): number {
  if (override != null && override > 0) return override;
  if (detected != null) return detected;
  return DEFAULT_CRUISING_KN;
}
