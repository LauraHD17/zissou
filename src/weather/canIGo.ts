// Given a forecast window and operator wind/wave limits, return a plain
// "can I go?" verdict. v1 only checks wind (NWS hourly API doesn't reliably
// surface wave heights for arbitrary points — marine-zone endpoint would).
// Wave support lands when we wire the zones endpoint.

import type { HourlyForecastEntry } from './weatherStore';

export type GoVerdict = 'safe' | 'watch' | 'nogo' | 'unknown';

export interface GoAssessment {
  verdict: GoVerdict;
  /** Worst (highest) wind during the window, kn. null if no data. */
  maxWindKn: number | null;
  /** Dominant direction during the window, °. null if no data. */
  dominantWindDeg: number | null;
  /** Plain-language summary. */
  summary: string;
}

export function assessWindow(
  hourly: HourlyForecastEntry[],
  fromMs: number,
  toMs: number,
  maxWindKn: number | undefined,
): GoAssessment {
  const relevant = hourly.filter((h) => h.t >= fromMs && h.t <= toMs && h.windKn != null);
  if (relevant.length === 0) {
    return {
      verdict: 'unknown',
      maxWindKn: null,
      dominantWindDeg: null,
      summary: 'No forecast for that window.',
    };
  }
  const maxWind = Math.max(...relevant.map((h) => h.windKn!));
  const dom = dominantDirection(relevant);

  if (maxWindKn == null) {
    return {
      verdict: 'unknown',
      maxWindKn: maxWind,
      dominantWindDeg: dom,
      summary: `Wind ${formatDir(dom)} up to ${Math.round(maxWind)} kn. Set a max wind limit in Settings for an assessment.`,
    };
  }
  if (maxWind <= maxWindKn) {
    return {
      verdict: 'safe',
      maxWindKn: maxWind,
      dominantWindDeg: dom,
      summary: `Wind ${formatDir(dom)} up to ${Math.round(maxWind)} kn — within your ${maxWindKn} kn limit.`,
    };
  }
  if (maxWind <= maxWindKn * 1.25) {
    return {
      verdict: 'watch',
      maxWindKn: maxWind,
      dominantWindDeg: dom,
      summary: `Wind ${formatDir(dom)} up to ${Math.round(maxWind)} kn — over your ${maxWindKn} kn limit. Check conditions before departing.`,
    };
  }
  return {
    verdict: 'nogo',
    maxWindKn: maxWind,
    dominantWindDeg: dom,
    summary: `Wind ${formatDir(dom)} up to ${Math.round(maxWind)} kn — above your ${maxWindKn} kn limit. Not recommended.`,
  };
}

function dominantDirection(hs: HourlyForecastEntry[]): number | null {
  const withDeg = hs.filter(
    (h): h is HourlyForecastEntry & { windDeg: number } => h.windDeg != null,
  );
  if (withDeg.length === 0) return null;
  // Circular mean.
  let sx = 0,
    sy = 0;
  for (const h of withDeg) {
    const r = (h.windDeg * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  const avg = (Math.atan2(sy, sx) * 180) / Math.PI;
  return (avg + 360) % 360;
}

function formatDir(deg: number | null): string {
  if (deg == null) return '';
  const cards = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const idx = Math.round(deg / 22.5) % 16;
  return cards[idx];
}
