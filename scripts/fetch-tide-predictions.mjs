#!/usr/bin/env node
// Pre-fetch a year (or two) of high/low tide predictions for Penobscot Bay
// stations, write to public/tides/<year>.json so the Pi can run fully offline.
//
// Usage:
//   node scripts/fetch-tide-predictions.mjs              # current year
//   node scripts/fetch-tide-predictions.mjs 2027         # specific year
//   node scripts/fetch-tide-predictions.mjs 2026 2       # 2026 + 2027 (rolling window)
//   node scripts/fetch-tide-predictions.mjs --verify-only  # re-check the committed file
//   node scripts/fetch-tide-predictions.mjs --skip-verify  # fetch without the check
//
// NOAA's public datagetter API needs no key and accepts hi/lo predictions
// up to one year per request. We loop year-by-year per station so the script
// never trips the range limit even if NOAA changes it later.
//
// VERIFICATION (on by default): before writing, the app's cosine
// interpolation between the fetched hi/lo events is compared against NOAA's
// own continuous 6-minute prediction series on four sample days per station.
// This is an intentional redundancy — it catches a datum mix-up (MLLW vs MSL
// shifts ~5 ft here), meters-vs-feet (~2×), or a timezone slip (an hour is
// several feet of tide in Maine) before bad data ships to the boat. The
// committed golden test (src/utils/tidesGoldenNoaa.test.ts) is the offline
// twin of this check. On failure nothing is written and the exit code is 1.
//
// Re-run at the start of each cruising season. Commit the resulting JSON.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIONS = [
  { id: '8413320', name: 'Bar Harbor', lat: 44.3922, lon: -68.2043 },
  { id: '8414672', name: 'Castine', lat: 44.3867, lon: -68.7967 },
  { id: '8415490', name: 'Rockland', lat: 44.105, lon: -69.1017 },
  { id: '8414856', name: 'North Haven', lat: 44.1267, lon: -68.8733 },
];

const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(year, month, day) {
  return `${year}${pad(month)}${pad(day)}`;
}

// NOAA returns times like "2026-01-01 00:30". Convert to ISO-8601 in UTC.
function toIso(s) {
  return `${s.replace(' ', 'T')}:00Z`;
}

async function fetchYear(stationId, year) {
  const url = new URL(API);
  url.searchParams.set('product', 'predictions');
  url.searchParams.set('interval', 'hilo');
  url.searchParams.set('datum', 'MLLW');
  url.searchParams.set('units', 'english');
  url.searchParams.set('time_zone', 'gmt');
  url.searchParams.set('format', 'json');
  url.searchParams.set('application', 'navigation-project');
  url.searchParams.set('station', stationId);
  url.searchParams.set('begin_date', ymd(year, 1, 1));
  url.searchParams.set('end_date', ymd(year, 12, 31));

  const r = await fetch(url);
  if (!r.ok) throw new Error(`NOAA ${stationId} ${year}: HTTP ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(`NOAA ${stationId} ${year}: ${json.error.message}`);
  if (!Array.isArray(json.predictions)) {
    throw new Error(`NOAA ${stationId} ${year}: no predictions in response`);
  }
  return json.predictions.map((p) => ({
    t: toIso(p.t),
    kind: p.type === 'H' ? 'H' : 'L',
    heightFt: Number(p.v),
  }));
}

async function fetchStation(station, years) {
  const events = [];
  for (const y of years) {
    process.stdout.write(`  ${station.name} ${y}... `);
    const got = await fetchYear(station.id, y);
    events.push(...got);
    console.log(`${got.length} events`);
  }
  return { ...station, events };
}

// ── Verification against NOAA's continuous 6-minute series ────────────────

// Mirror of tideHeightFt's cosine interpolation in src/utils/tides.ts. Kept
// deliberately independent (this is the cross-check, not shared code) — if
// the two ever disagree, this verification fails and says so.
function interpHeightFt(events, tMs) {
  // events: [{tMs, heightFt}] sorted ascending
  if (events.length < 2 || tMs < events[0].tMs || tMs >= events[events.length - 1].tMs) {
    return null;
  }
  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].tMs <= tMs) lo = mid + 1;
    else hi = mid;
  }
  const a = events[lo - 1];
  const b = events[lo];
  const tau = (tMs - a.tMs) / (b.tMs - a.tMs);
  return a.heightFt + ((b.heightFt - a.heightFt) * (1 - Math.cos(Math.PI * tau))) / 2;
}

async function fetchSixMinuteDay(stationId, dateYmd) {
  const url = new URL(API);
  url.searchParams.set('product', 'predictions');
  url.searchParams.set('interval', '6');
  url.searchParams.set('datum', 'MLLW');
  url.searchParams.set('units', 'english');
  url.searchParams.set('time_zone', 'gmt');
  url.searchParams.set('format', 'json');
  url.searchParams.set('application', 'navigation-project');
  url.searchParams.set('station', stationId);
  url.searchParams.set('begin_date', dateYmd);
  url.searchParams.set('end_date', dateYmd);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NOAA 6-min ${stationId} ${dateYmd}: HTTP ${r.status}`);
  const json = await r.json();
  if (!Array.isArray(json.predictions)) {
    // Subordinate stations (Castine, Rockland, North Haven) publish hi/lo
    // only — the continuous series exists just for harmonic stations like
    // Bar Harbor. Callers fall back to an event-integrity check.
    return null;
  }
  return json.predictions.map((p) => ({
    tMs: Date.parse(toIso(p.t)),
    heightFt: Number(p.v),
  }));
}

async function fetchHiloDay(stationId, dateYmd) {
  const url = new URL(API);
  url.searchParams.set('product', 'predictions');
  url.searchParams.set('interval', 'hilo');
  url.searchParams.set('datum', 'MLLW');
  url.searchParams.set('units', 'english');
  url.searchParams.set('time_zone', 'gmt');
  url.searchParams.set('format', 'json');
  url.searchParams.set('application', 'navigation-project');
  url.searchParams.set('station', stationId);
  url.searchParams.set('begin_date', dateYmd);
  url.searchParams.set('end_date', dateYmd);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NOAA hilo ${stationId} ${dateYmd}: HTTP ${r.status}`);
  const json = await r.json();
  if (!Array.isArray(json.predictions)) {
    throw new Error(`NOAA hilo ${stationId} ${dateYmd}: no predictions`);
  }
  return json.predictions.map((p) => ({
    tMs: Date.parse(toIso(p.t)),
    heightFt: Number(p.v),
  }));
}

/** Subordinate-station check: re-fetch the day's hi/lo and require the
 *  payload to contain each event at the same minute and height (±0.1 ft).
 *  Catches file corruption, a station-id mix-up, or datum drift even where
 *  the 6-minute series isn't available. */
async function verifyHiloEventsForDay(station, events, day) {
  const official = await fetchHiloDay(station.id, day);
  for (const o of official) {
    const match = events.find(
      (e) => Math.abs(e.tMs - o.tMs) <= 2 * 60_000 && Math.abs(e.heightFt - o.heightFt) <= 0.1,
    );
    if (!match) {
      throw new Error(
        `VERIFICATION FAILED: ${station.name} ${day} — official event ` +
          `(${new Date(o.tMs).toISOString()}, ${o.heightFt} ft) has no match in the payload. ` +
          `Possible station-id mix-up or corrupted file.`,
      );
    }
  }
  return official.length;
}

const MAX_VERIFY_ERR_FT = 0.6; // app-measured max is ~0.15 ft; datum/unit/tz mistakes are ≥1 ft

async function verifyPayload(payload, sampleYear) {
  // Four days spread across the seasons — springs and neaps both get hit.
  const sampleDays = [
    ymd(sampleYear, 2, 15),
    ymd(sampleYear, 5, 15),
    ymd(sampleYear, 8, 15),
    ymd(sampleYear, 11, 15),
  ];
  console.log(
    `\nVerifying against NOAA's official 6-minute series (${sampleDays.length} days × ${payload.stations.length} stations)…`,
  );
  let worst = { err: 0, where: '' };
  let minSeen = Infinity;
  let interpChecked = false;
  for (const station of payload.stations) {
    const events = station.events
      .map((e) => ({ tMs: Date.parse(e.t), heightFt: e.heightFt }))
      .sort((a, b) => a.tMs - b.tMs);
    for (const day of sampleDays) {
      const official = await fetchSixMinuteDay(station.id, day);
      if (official === null) {
        // Hi/lo-only subordinate station — check event integrity instead.
        const nEvents = await verifyHiloEventsForDay(station, events, day);
        process.stdout.write(
          `  ${station.name} ${day}: hi/lo-only station — ${nEvents} events match NOAA\n`,
        );
        continue;
      }
      let dayMax = 0;
      let n = 0;
      for (const p of official) {
        const ours = interpHeightFt(events, p.tMs);
        if (ours == null || !Number.isFinite(p.heightFt)) continue;
        const err = Math.abs(ours - p.heightFt);
        if (err > dayMax) dayMax = err;
        if (p.heightFt < minSeen) minSeen = p.heightFt;
        n++;
      }
      if (n < 100)
        throw new Error(`verification ${station.name} ${day}: only ${n} comparable points`);
      interpChecked = true;
      process.stdout.write(
        `  ${station.name} ${day}: max err ${dayMax.toFixed(2)} ft (${n} pts)\n`,
      );
      if (dayMax > worst.err) worst = { err: dayMax, where: `${station.name} ${day}` };
    }
  }
  if (!interpChecked) {
    throw new Error(
      'VERIFICATION FAILED: no station offered the 6-minute series, so the interpolation ' +
        'was never exercised. At least one harmonic station (Bar Harbor) is expected.',
    );
  }
  console.log(
    `  Worst interpolation error: ${worst.err.toFixed(2)} ft at ${worst.where}; lowest official level seen ${minSeen.toFixed(1)} ft`,
  );
  if (worst.err > MAX_VERIFY_ERR_FT) {
    throw new Error(
      `VERIFICATION FAILED: interpolated heights differ from NOAA's official series by ` +
        `${worst.err.toFixed(2)} ft (limit ${MAX_VERIFY_ERR_FT}) at ${worst.where}. ` +
        `Check datum/units/time_zone parameters before trusting this data on the water.`,
    );
  }
  console.log('  Verification PASSED.');
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const flags = new Set(rawArgs.filter((a) => a.startsWith('--')));
  const args = rawArgs.filter((a) => !a.startsWith('--'));
  const startYear = args[0] ? Number(args[0]) : new Date().getUTCFullYear();
  const span = args[1] ? Number(args[1]) : 2;
  if (!Number.isFinite(startYear) || !Number.isFinite(span) || span < 1) {
    console.error(
      'Usage: fetch-tide-predictions.mjs [startYear] [yearSpan=2] [--verify-only|--skip-verify]',
    );
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, '..', 'public', 'tides');
  const outFile = resolve(outDir, `${startYear}.json`);

  if (flags.has('--verify-only')) {
    const payload = JSON.parse(await readFile(outFile, 'utf8'));
    await verifyPayload(payload, startYear);
    return;
  }

  const years = Array.from({ length: span }, (_, i) => startYear + i);

  console.log(`Fetching tide predictions for years ${years.join(', ')}`);
  console.log(`Stations: ${STATIONS.map((s) => s.name).join(', ')}`);

  const stations = [];
  for (const s of STATIONS) stations.push(await fetchStation(s, years));

  const validFrom = `${startYear}-01-01T00:00:00Z`;
  const validTo = `${startYear + span - 1}-12-31T23:59:59Z`;

  const payload = {
    fetchedAt: new Date().toISOString(),
    validFrom,
    validTo,
    stations,
  };

  // Verify BEFORE writing — bad data must never reach the committed file.
  if (!flags.has('--skip-verify')) {
    await verifyPayload(payload, startYear);
  } else {
    console.log('\n(--skip-verify: writing without the 6-minute cross-check)');
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(payload), 'utf8');

  const total = stations.reduce((acc, s) => acc + s.events.length, 0);
  const sizeKb = Math.round(JSON.stringify(payload).length / 1024);
  console.log(`\nWrote ${outFile}`);
  console.log(`  ${total} events across ${stations.length} stations, ${sizeKb} KB`);
  console.log(`  validFrom=${validFrom}  validTo=${validTo}`);
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
