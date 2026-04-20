// "Safe Return" estimate — how much daylight is left, how long it'll take to
// get home at cruising speed, and what time the operator should depart if
// they want to be in before dark.
//
// All offline: suncalc for sun events + haversine for distance + auto
// cruising speed from GPS samples.

import { useMemo } from 'react';
import SunCalc from 'suncalc';
import { useSelf } from '../signalk/useSignalK';
import { useNow } from '../utils/clock';
import { haversineNm, isPlausiblePosition } from '../utils/geometry';
import { useUserPrefs } from '../prefs/userPrefsStore';
import {
  computeDetectedCruisingKn,
  resolveCruisingSpeedKn,
  useCruisingSpeedSamples,
} from '../prefs/cruisingSpeedStore';

export interface SafeReturnState {
  /** Hours of daylight left. */
  daylightHoursLeft: number;
  /** Minutes from now to sunset (negative after sunset). */
  minsToSunset: number;
  /** Distance to the home mooring, nm. null if no home set or no fix. */
  distanceHomeNm: number | null;
  /** ETA home at cruising speed, in minutes. null if no home / no cruise kn. */
  etaHomeMins: number | null;
  /** Margin after arriving home: daylight left at arrival, in minutes.
   *  Negative = you'd arrive after sunset. */
  marginMins: number | null;
  /** Latest suggested departure time (Date), so you arrive at sunset. */
  latestDepartureBy: Date | null;
  /** Detected cruising speed in knots (null until warmed up). */
  detectedKn: number | null;
  /** Effective cruising speed used (override > detected > default). */
  effectiveKn: number;
}

export function useSafeReturn(): SafeReturnState {
  const self = useSelf();
  const prefs = useUserPrefs();
  const samples = useCruisingSpeedSamples();
  const now = useNow(60_000);

  return useMemo(() => {
    const detectedKn = computeDetectedCruisingKn(samples);
    const effectiveKn = resolveCruisingSpeedKn(prefs.propulsion.cruisingSpeedKn, detectedKn);

    const pos = self?.position && isPlausiblePosition(self.position) ? self.position : null;
    const home = prefs.homeMooring;

    const distanceHomeNm =
      pos && home ? haversineNm(pos, { latitude: home.latitude, longitude: home.longitude }) : null;
    const etaHomeMins =
      distanceHomeNm != null && effectiveKn > 0 ? (distanceHomeNm / effectiveKn) * 60 : null;

    const sunPos = pos ?? { latitude: 44.4, longitude: -68.8 }; // fallback
    const times = SunCalc.getTimes(now, sunPos.latitude, sunPos.longitude);
    const sunset = times.sunset;
    const minsToSunset = sunset instanceof Date ? (sunset.getTime() - now.getTime()) / 60_000 : NaN;
    const daylightHoursLeft = Math.max(0, minsToSunset / 60);

    const marginMins = etaHomeMins != null ? minsToSunset - etaHomeMins : null;
    const latestDepartureBy =
      etaHomeMins != null && sunset instanceof Date
        ? new Date(sunset.getTime() - etaHomeMins * 60_000)
        : null;

    return {
      daylightHoursLeft,
      minsToSunset,
      distanceHomeNm,
      etaHomeMins,
      marginMins,
      latestDepartureBy,
      detectedKn,
      effectiveKn,
    };
  }, [
    now,
    self?.position?.latitude,
    self?.position?.longitude,
    prefs.propulsion.cruisingSpeedKn,
    prefs.homeMooring?.latitude,
    prefs.homeMooring?.longitude,
    samples,
  ]);
}
