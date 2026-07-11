// Runtime redundancy: cross-check the wire's reported SOG against the speed
// implied by successive GPS positions. Both are speed-over-ground, so on a
// healthy feed they agree within GPS noise. A sustained disagreement almost
// always means a units misconfiguration at the source — SOG emitted in knots
// or km/h instead of the spec's m/s — which would silently skew every speed
// readout, ETA, and threat calculation by 2–4×.
//
// Same philosophy as the COG-degrees warning in useSignalK: we NEVER convert
// on a guess (a plausible-looking number in the wrong unit is undetectable
// point-by-point), we surface the misconfiguration once so it gets fixed at
// the source. Detection only — no app behavior changes on mismatch.
//
// Tuning notes:
// - 60 s sliding window, judged only when both speeds are above ~2 kn, so
//   anchored jitter (position noise over near-zero motion) can't false-fire.
// - Track distance is summed segment-by-segment; over 60 s of straight-ish
//   coastal cruising, derived and reported agree within ~10%. The 1.5× ratio
//   gate catches the smallest real unit error (kn-as-m/s reads 1.94× high)
//   with margin on both sides.
// - Mismatch must persist ~20 consecutive evaluations (≈20 s at 1 Hz) before
//   the callback fires, and it fires at most once per session.

import type { Position } from './types';
import { haversineMeters } from '../utils/geometry';
import { isValidSogMs } from './types';
import { msToKnots } from '../utils/units';

const WINDOW_MS = 60_000;
const MIN_SPAN_MS = 45_000;
const MIN_SAMPLES = 20;
const GAP_RESET_MS = 5_000; // a fix gap breaks the track integral — start over
const MIN_JUDGE_MS = 1.0; // ~2 kn: below this, jitter dominates both signals
const RATIO_LIMIT = 1.5;
const ABS_DIFF_MS = 0.75; // ~1.5 kn: ratio alone is twitchy near the floor
const SUSTAIN_EVALS = 20;

interface Sample {
  tMs: number;
  lat: number;
  lon: number;
  sogMs: number;
}

export interface SpeedMismatch {
  reportedKn: number;
  derivedKn: number;
}

export interface SpeedConsistencyChecker {
  /** Feed every self-vessel update. Invalid/missing SOG samples are skipped. */
  sample(tMs: number, pos: Position | undefined, sogMs: number | undefined): void;
}

export function createSpeedConsistencyChecker(
  onSustainedMismatch: (info: SpeedMismatch) => void,
): SpeedConsistencyChecker {
  const buf: Sample[] = [];
  let streak = 0;
  let fired = false;

  return {
    sample(tMs, pos, sogMs) {
      if (fired) return;
      if (!pos || !isValidSogMs(sogMs)) return;

      const last = buf[buf.length - 1];
      if (last && (tMs - last.tMs > GAP_RESET_MS || tMs < last.tMs)) {
        buf.length = 0;
        streak = 0;
      }
      buf.push({ tMs, lat: pos.latitude, lon: pos.longitude, sogMs });
      while (buf.length > 0 && buf[0].tMs < tMs - WINDOW_MS) buf.shift();

      const spanMs = tMs - buf[0].tMs;
      if (spanMs < MIN_SPAN_MS || buf.length < MIN_SAMPLES) return;

      let trackM = 0;
      for (let i = 1; i < buf.length; i++) {
        trackM += haversineMeters(
          { latitude: buf[i - 1].lat, longitude: buf[i - 1].lon },
          { latitude: buf[i].lat, longitude: buf[i].lon },
        );
      }
      const derivedMs = trackM / (spanMs / 1000);
      const reportedMs = buf.reduce((s, b) => s + b.sogMs, 0) / buf.length;

      // Judge only when the WIRE claims real speed. Every units mistake this
      // sentinel hunts (kn / km/h / mph emitted on the m/s field) inflates
      // the reported number, so that side gates. The reverse asymmetry —
      // derived high while reported ~0 — is dominated at anchor by GPS
      // jitter, whose segment-sum inflates the track integral; judging on it
      // would false-alarm every quiet night on the hook.
      if (reportedMs < MIN_JUDGE_MS) {
        streak = 0;
        return;
      }

      const hi = Math.max(derivedMs, reportedMs);
      const lo = Math.min(derivedMs, reportedMs);
      const mismatch = hi - lo > ABS_DIFF_MS && (lo === 0 || hi / lo > RATIO_LIMIT);

      if (!mismatch) {
        streak = 0;
        return;
      }
      streak++;
      if (streak >= SUSTAIN_EVALS) {
        fired = true;
        onSustainedMismatch({
          reportedKn: msToKnots(reportedMs),
          derivedKn: msToKnots(derivedMs),
        });
      }
    },
  };
}
