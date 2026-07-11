// Fetch an hourly forecast from the US National Weather Service API
// (api.weather.gov — free, no API key, HTTPS only). Two-hop protocol:
//   1. /points/{lat},{lon} → grid + forecast URLs for that location
//   2. GET the hourly forecast URL → 7-day hourly periods
//
// Graceful on offline / failure: throws, the caller catches and keeps the
// existing cache. The API is US-only, which is fine for this boat's cruising
// area (Penobscot Bay).

import type { HourlyForecastEntry } from './weatherStore';

const USER_AGENT = '(navigation-project, operator contact via github.com/LauraHD17)';
const MPH_TO_KN = 0.868976;

interface PointsResponse {
  properties: { forecastHourly?: string };
}
interface HourlyResponse {
  properties: {
    periods: {
      startTime: string;
      windSpeed: string; // e.g., "5 to 10 mph"
      windDirection: string; // e.g., "N", "NE", etc.
      shortForecast: string;
      temperature: number;
      temperatureUnit: 'F' | 'C';
    }[];
  };
}

export async function fetchHourlyForecast(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<HourlyForecastEntry[]> {
  // Round to 4 decimals — NWS recommends this cap to maximize grid cache hits.
  const latR = Number(lat.toFixed(4));
  const lonR = Number(lon.toFixed(4));

  const pointsRes = await fetch(`https://api.weather.gov/points/${latR},${lonR}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
    signal,
  });
  if (!pointsRes.ok) throw new Error(`points ${pointsRes.status}`);
  const pointsJson = (await pointsRes.json()) as PointsResponse;
  const hourlyUrl = pointsJson.properties.forecastHourly;
  if (!hourlyUrl) throw new Error('no forecastHourly URL');
  // Second hop follows a URL from the response body — pin it to the NWS
  // host over HTTPS so a tampered payload can't send the kiosk elsewhere.
  const parsed = new URL(hourlyUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.weather.gov') {
    throw new Error('unexpected forecastHourly host');
  }

  const hourlyRes = await fetch(hourlyUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
    signal,
  });
  if (!hourlyRes.ok) throw new Error(`hourly ${hourlyRes.status}`);
  const hourlyJson = (await hourlyRes.json()) as HourlyResponse;

  return hourlyJson.properties.periods.map((p) => ({
    t: new Date(p.startTime).getTime(),
    windKn: parseWindMph(p.windSpeed) * MPH_TO_KN,
    windDeg: windDirectionToDeg(p.windDirection),
    shortDescription: p.shortForecast,
    tempF: p.temperatureUnit === 'F' ? p.temperature : (p.temperature * 9) / 5 + 32,
  }));
}

function parseWindMph(s: string | undefined): number {
  if (!s) return NaN;
  const nums = s.match(/\d+/g);
  if (!nums) return NaN;
  const asNums = nums.map(Number).filter(Number.isFinite);
  if (asNums.length === 0) return NaN;
  // NWS gives either "5 mph" or "5 to 10 mph" — take the upper bound for safety.
  return Math.max(...asNums);
}

function windDirectionToDeg(d: string | undefined): number | undefined {
  if (!d) return undefined;
  const table: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
  };
  return table[d.toUpperCase()];
}
