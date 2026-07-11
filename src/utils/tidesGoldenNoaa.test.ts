// Golden-data redundancy for the tide math: our cosine interpolation between
// hi/lo events is checked against NOAA's OWN continuous 6-minute prediction
// series — the authoritative output of their full harmonic model. The fixture
// holds two contrasting real days for Bar Harbor (winter springs with
// below-MLLW lows, and mid-July), captured 2026-07-11.
//
// Measured accuracy at capture time: max 0.15 ft, mean 0.04 ft over 960
// points. The 0.5 ft gate leaves headroom for interpolation limits while
// still catching the failure modes that matter — a datum mix-up (MLLW vs MSL
// is a ~5 ft shift here), meters-vs-feet (~2×), or timezone drift (an hour is
// several feet of tide in Maine).
//
// The annual data refresh re-runs this comparison against LIVE NOAA data:
// `node scripts/fetch-tide-predictions.mjs --verify` (see docs/tides.md).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { __setTidesForTests, tideHeightNow, type TidePayload } from './tides';
import goldenJson from './__fixtures__/noaa-golden-bar-harbor-2026.json';

interface GoldenFixture {
  payload: TidePayload;
  official6min: { label: string; predictions: { t: string; v: string }[] }[];
}

const fixture = goldenJson as unknown as GoldenFixture;

const BAR_HARBOR = { latitude: 44.3922, longitude: -68.2043 };
const MAX_ERR_FT = 0.5;

describe('tide interpolation vs NOAA official 6-min predictions (Bar Harbor)', () => {
  beforeAll(() => __setTidesForTests(fixture.payload));
  afterAll(() => __setTidesForTests(null));

  for (const window of fixture.official6min) {
    it(`stays within ${MAX_ERR_FT} ft of NOAA: ${window.label}`, () => {
      expect(window.predictions.length).toBeGreaterThan(400); // fixture sanity
      let maxErr = 0;
      for (const p of window.predictions) {
        const t = new Date(p.t.replace(' ', 'T') + 'Z');
        const official = Number(p.v);
        expect(Number.isFinite(official)).toBe(true);
        const app = tideHeightNow(t, BAR_HARBOR);
        expect(app.isEstimate).toBe(false); // must be reading the fixture, not the stub
        const err = Math.abs(app.heightFt - official);
        if (err > maxErr) maxErr = err;
      }
      expect(maxErr).toBeLessThan(MAX_ERR_FT);
    });
  }

  it('the springs window really exercises below-MLLW water (guards fixture rot)', () => {
    // The negative-tide drying-alarm bug hid because no fixture went below 0.
    // If this fixture ever gets regenerated without a negative low, fail
    // loudly rather than silently losing the coverage.
    const springs = fixture.official6min[0];
    const min = Math.min(...springs.predictions.map((p) => Number(p.v)));
    expect(min).toBeLessThan(0);
  });
});
