// Intentional redundancy: verify navigation math against INDEPENDENT
// references, not against itself. Each section uses a different oracle:
//
//   geometry   — an inline Vincenty inverse on the WGS84 ellipsoid (different
//                formula AND different earth model than our spherical haversine;
//                the two can't share a bug)
//   units      — constants re-derived from the defining relationships
//                (1 nm = 1852 m, 1 mile = 1609.344 m, 1 yd = 0.9144 m)
//   kinematics — closed-form cases where the answer is knowable by hand
//   sun        — reference times computed by the NOAA solar algorithm
//                (sunrise-sunset.org, fetched 2026-07-11) for Bar Harbor
//
// If one of these fails after a "harmless" refactor, trust the oracle first.
// The tide interpolation has its own golden-data suite: tidesGoldenNoaa.test.ts.

import { describe, expect, it } from 'vitest';
import SunCalc from 'suncalc';
import {
  haversineMeters,
  bearingRadians,
  projectPosition,
  samplePolyline,
} from './geometry';
import { closingSpeedMs } from './threat';
import {
  msToKnots,
  msToMph,
  metersToFeet,
  feetToMeters,
  formatDistance,
  NM_TO_METERS,
} from './units';

// ── Independent oracle: Vincenty inverse (WGS84 ellipsoid) ──────────────────
function vincentyMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const A = 6378137;
  const F = 1 / 298.257223563;
  const B = A * (1 - F);
  const toRad = (d: number) => (d * Math.PI) / 180;
  const L = toRad(b.longitude - a.longitude);
  const U1 = Math.atan((1 - F) * Math.tan(toRad(a.latitude)));
  const U2 = Math.atan((1 - F) * Math.tan(toRad(b.latitude)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  let lambdaP: number;
  let iter = 0;
  let sinSigma: number;
  let cosSigma: number;
  let sigma: number;
  let cosSqAlpha: number;
  let cos2SigmaM: number;
  do {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) *
        F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iter < 200);
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const kA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const kB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    kB *
    sinSigma *
    (cos2SigmaM +
      (kB / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (kB / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return B * kA * (sigma - deltaSigma);
}

const BAR_HARBOR = { latitude: 44.3922, longitude: -68.2043 };
const CASTINE = { latitude: 44.3867, longitude: -68.7967 };
const ROCKLAND = { latitude: 44.1037, longitude: -69.1089 };

describe('geometry vs Vincenty/WGS84 (sphere-vs-ellipsoid divergence caps at ~0.55%)', () => {
  const pairs: [string, typeof BAR_HARBOR, typeof BAR_HARBOR][] = [
    ['Bar Harbor → Castine (~25 nm)', BAR_HARBOR, CASTINE],
    ['Castine → Rockland (~20 nm)', CASTINE, ROCKLAND],
    ['200 m apart at 44°N (threat-band scale)', CASTINE, { latitude: 44.3885, longitude: -68.7967 }],
    [
      'JFK → LHR (~3000 nm, worst-case for the spherical model)',
      { latitude: 40.6413, longitude: -73.7781 },
      { latitude: 51.47, longitude: -0.4543 },
    ],
  ];
  for (const [name, a, b] of pairs) {
    it(`haversine within 0.6% of Vincenty: ${name}`, () => {
      const hav = haversineMeters(a, b);
      const vin = vincentyMeters(a, b);
      expect(Math.abs(hav - vin) / vin).toBeLessThan(0.006);
    });
  }

  it('project-then-measure round-trips distance (<1 cm) and bearing (<0.06°)', () => {
    for (const brgDeg of [0, 37, 90, 135, 222, 300]) {
      for (const dist of [50, 500, 5000]) {
        const brg = (brgDeg * Math.PI) / 180;
        const end = projectPosition(CASTINE, brg, dist);
        expect(Math.abs(haversineMeters(CASTINE, end) - dist)).toBeLessThan(0.01);
        const back = bearingRadians(CASTINE, end);
        const dBrg = Math.abs(((back - brg + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        expect(dBrg).toBeLessThan(0.001);
      }
    }
  });

  it('samplePolyline spacing is even in true meters (±4%) across mixed N-S/E-W legs', () => {
    const pts = samplePolyline(
      [CASTINE, { latitude: 44.5, longitude: -68.7967 }, { latitude: 44.5, longitude: -68.5 }],
      20,
    );
    const gaps: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) gaps.push(haversineMeters(pts[i], pts[i + 1]));
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - mean) / mean).toBeLessThan(0.04);
  });
});

describe('unit constants re-derived from their definitions', () => {
  it('1 m/s → knots is exactly 3600/1852', () => {
    expect(msToKnots(1)).toBeCloseTo(3600 / 1852, 9);
  });
  it('1 m/s → mph is exactly 3600/1609.344', () => {
    expect(msToMph(1)).toBeCloseTo(3600 / 1609.344, 8);
  });
  it('meters↔feet round-trips (1 ft = 0.3048 m exactly)', () => {
    expect(metersToFeet(1)).toBeCloseTo(1 / 0.3048, 4);
    expect(feetToMeters(metersToFeet(123.45))).toBeCloseTo(123.45, 6);
  });
  it('NM_TO_METERS is the exact definition', () => {
    expect(NM_TO_METERS).toBe(1852);
  });
  it('formatDistance: 0.5 nm → "926 meters (1013 yards)" (yd = 0.9144 m exactly)', () => {
    expect(formatDistance(0.5)).toBe('926 meters (1013 yards)');
  });
  it('formatDistance: 3.2 nm → 3.7 statute miles', () => {
    expect(formatDistance(3.2)).toBe('3.2 nautical miles (3.7 miles)');
  });
});

describe('closing speed: closed-form kinematic cases', () => {
  const north1nm = projectPosition(CASTINE, 0, 1852);
  it('head-on = sum of speeds', () => {
    expect(closingSpeedMs(CASTINE, 5, 0, north1nm, 3, Math.PI)).toBeCloseTo(8, 2);
  });
  it('stern chase = difference of speeds', () => {
    expect(closingSpeedMs(CASTINE, 5, 0, north1nm, 3, 0)).toBeCloseTo(2, 2);
  });
  it('mutual retreat = negative sum', () => {
    expect(closingSpeedMs(CASTINE, 5, Math.PI, north1nm, 3, 0)).toBeCloseTo(-8, 2);
  });
  it('perpendicular crossing ≈ 0', () => {
    expect(Math.abs(closingSpeedMs(CASTINE, 0, 0, north1nm, 3, Math.PI / 2))).toBeLessThan(0.05);
  });
});

describe('suncalc vs the NOAA solar algorithm', () => {
  // Reference: sunrise-sunset.org (implements NOAA's solar equations),
  // queried 2026-07-11 for Bar Harbor (44.3922, −68.2043). suncalc's
  // simplified model is good to ~±3 min — plenty for daylight margins and
  // civil-twilight theme switching, but never trust sun times to the minute.
  const REF = {
    sunrise: '2026-07-11T08:57:46+00:00',
    sunset: '2026-07-12T00:19:00+00:00',
    civilDawn: '2026-07-11T08:23:49+00:00',
    civilDusk: '2026-07-12T00:52:57+00:00',
  };
  it('sunrise/sunset within 5 minutes of the reference', () => {
    const t = SunCalc.getTimes(new Date('2026-07-11T16:00:00Z'), 44.3922, -68.2043);
    expect(Math.abs(t.sunrise.getTime() - Date.parse(REF.sunrise))).toBeLessThan(5 * 60_000);
    expect(Math.abs(t.sunset.getTime() - Date.parse(REF.sunset))).toBeLessThan(5 * 60_000);
  });
  it('civil twilight (theme auto-switch driver) within 5 minutes of the reference', () => {
    const t = SunCalc.getTimes(new Date('2026-07-11T16:00:00Z'), 44.3922, -68.2043);
    expect(Math.abs(t.dawn.getTime() - Date.parse(REF.civilDawn))).toBeLessThan(5 * 60_000);
    expect(Math.abs(t.dusk.getTime() - Date.parse(REF.civilDusk))).toBeLessThan(5 * 60_000);
  });
});
