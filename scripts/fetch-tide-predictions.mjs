#!/usr/bin/env node
// Pre-fetch a year (or two) of high/low tide predictions for Penobscot Bay
// stations, write to public/tides/<year>.json so the Pi can run fully offline.
//
// Usage:
//   node scripts/fetch-tide-predictions.mjs              # current year
//   node scripts/fetch-tide-predictions.mjs 2027         # specific year
//   node scripts/fetch-tide-predictions.mjs 2026 2       # 2026 + 2027 (rolling window)
//
// NOAA's public datagetter API needs no key and accepts hi/lo predictions
// up to one year per request. We loop year-by-year per station so the script
// never trips the range limit even if NOAA changes it later.
//
// Re-run at the start of each cruising season. Commit the resulting JSON.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIONS = [
  { id: '8413320', name: 'Bar Harbor', lat: 44.3922, lon: -68.2043 },
  { id: '8414672', name: 'Castine', lat: 44.3867, lon: -68.7967 },
  { id: '8415490', name: 'Rockland', lat: 44.105, lon: -69.1017 },
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

async function main() {
  const args = process.argv.slice(2);
  const startYear = args[0] ? Number(args[0]) : new Date().getUTCFullYear();
  const span = args[1] ? Number(args[1]) : 2;
  if (!Number.isFinite(startYear) || !Number.isFinite(span) || span < 1) {
    console.error('Usage: fetch-tide-predictions.mjs [startYear] [yearSpan=2]');
    process.exit(1);
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

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, '..', 'public', 'tides');
  const outFile = resolve(outDir, `${startYear}.json`);
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
