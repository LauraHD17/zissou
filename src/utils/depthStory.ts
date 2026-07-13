// Turn a charted depth near a tap point + the current tide into a
// plain-language depth story. Honesty rules apply: when the tide reading is
// an estimate (M2 stub / outside the prediction window) the story never
// presents a computed "now" depth — estimated tide can be off by feet, and a
// fabricated number over a ledge is how boats find rocks.

import { metersToFeet } from './units';
import { soundingNowFeet } from './navaidNarrative';

export interface DepthStoryInput {
  /** Charted depth at MLLW, meters (VALSOU/DEPTH for soundings, VALDCO for contours). */
  chartedMeters: number;
  /** A spot sounding under the tap, or the nearest depth contour. */
  source: 'sounding' | 'contour';
  /** Signed tide height above MLLW, feet (negative on spring lows). */
  tideFt: number;
  tideIsEstimate: boolean;
}

export interface DepthStory {
  headline: string;
  detail: string;
}

export function composeDepthStory(input: DepthStoryInput): DepthStory {
  const lowFt = metersToFeet(input.chartedMeters);
  const charted = `Charted ${fmtFt(lowFt)} ft at low water`;

  if (input.source === 'sounding') {
    if (input.tideIsEstimate) {
      return { headline: 'Tide unknown', detail: `${charted} — live depth unavailable` };
    }
    const nowFt = Math.round(soundingNowFeet(input.chartedMeters, input.tideFt));
    return {
      headline: `About ${nowFt} ft here now`,
      detail: `${charted} ${tidePhrase(input.tideFt)}`,
    };
  }

  // Contour: the tap is near a depth line, not on a measured spot.
  const headline = `Near the ${fmtFt(lowFt)}-ft depth line`;
  if (input.tideIsEstimate) {
    return { headline, detail: `${charted} — tide unknown` };
  }
  const nowFt = Math.round(soundingNowFeet(input.chartedMeters, input.tideFt));
  return {
    headline,
    detail: `${charted} ${tidePhrase(input.tideFt)} ≈ ${nowFt} ft now`,
  };
}

function tidePhrase(tideFt: number): string {
  if (tideFt >= 0) return `+ ${fmtFt(tideFt)} ft of tide`;
  return `− ${fmtFt(Math.abs(tideFt))} ft of tide (below low water)`;
}

/** Whole feet when clean, one decimal otherwise — soundings read like the
 *  chart ("4 ft", "8.2 ft"), not like a calculator. */
function fmtFt(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
