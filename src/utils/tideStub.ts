// M2 single-constituent stub — the last-resort tide fallback used only when
// no NOAA data (IDB or bundle) is available. A single sine wave keyed to one
// reference high; it can be feet off in either direction, so every reading it
// backs is flagged isEstimate=true and grounding-relevant consumers suppress
// or downgrade rather than trust it.

import type { TideEvent } from './tideData';

const M2_PERIOD_MS = 12.42 * 60 * 60 * 1000;
const HALF_PERIOD_MS = M2_PERIOD_MS / 2;
const REF_HIGH = new Date('2026-04-19T03:00:00').getTime();
const M2_AMPLITUDE_FT = 5;

export function stubNextEvent(now: Date): TideEvent {
  const elapsed = now.getTime() - REF_HIGH;
  const cycles = elapsed / M2_PERIOD_MS;
  const cycleFloor = Math.floor(cycles);
  const phase = cycles - cycleFloor;
  if (phase < 0.5) {
    const t = REF_HIGH + cycleFloor * M2_PERIOD_MS + HALF_PERIOD_MS;
    return { kind: 'low', time: new Date(t), direction: 'falling', isEstimate: true };
  }
  const t = REF_HIGH + (cycleFloor + 1) * M2_PERIOD_MS;
  return { kind: 'high', time: new Date(t), direction: 'rising', isEstimate: true };
}

export function stubHeightFt(now: Date): number {
  const elapsed = now.getTime() - REF_HIGH;
  const phase = (elapsed / M2_PERIOD_MS) * 2 * Math.PI;
  return M2_AMPLITUDE_FT * (1 + Math.cos(phase));
}
