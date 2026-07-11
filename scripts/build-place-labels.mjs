// Build public/labels/maine-places.json from USGS GNIS domestic names —
// one clean label POINT per named place, which is what the chart labels
// render from. Solves the label-repeat problem at the source (polygon
// labeling repeats once per tile-split piece) and adds water names the
// ENC land polygons never had (bays, channels — "Fox Islands Thorofare").
//
// Requires only node + curl/unzip (no GDAL/tippecanoe): the output is a
// plain GeoJSON FeatureCollection served with the app and precached by
// the service worker (~600 KB).
//
// Usage: node scripts/build-place-labels.mjs [path/to/DomesticNames_ME.txt]
//   Without an argument, downloads the current USGS file to a temp dir.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GNIS_URL =
  'https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_ME_Text.zip';

// feature_class → { mz: label minzoom, c: class code, p: collision priority }
// Tiers mirror how a chart plotter discloses names: towns first, islands,
// bays and channels next, capes last. Everything else (streams, summits,
// swamps…) is skipped — this is a coastal nav aid, not a gazetteer.
const CLASSES = {
  'Populated Place': { mz: 9, c: 'town', p: 0 },
  Island: { mz: 10, c: 'island', p: 1 },
  Bay: { mz: 10, c: 'water', p: 2 },
  Channel: { mz: 10, c: 'water', p: 2 },
  Harbor: { mz: 11, c: 'water', p: 2 },
  Cape: { mz: 12, c: 'island', p: 3 },
};

let txtPath = process.argv[2];
if (!txtPath) {
  const work = mkdtempSync(join(tmpdir(), 'gnis-'));
  console.log(`[labels] downloading ${GNIS_URL}`);
  execFileSync('curl', ['-sL', '--fail', '-o', join(work, 'gnis.zip'), GNIS_URL]);
  execFileSync('unzip', ['-o', '-q', join(work, 'gnis.zip'), '-d', work]);
  txtPath = join(work, 'Text', 'DomesticNames_ME.txt');
}

const lines = readFileSync(txtPath, 'utf8').split('\n');
const header = lines[0].replace(/^﻿/, '').split('|');
const col = (name) => header.indexOf(name);
const iName = col('feature_name');
const iClass = col('feature_class');
const iLat = col('prim_lat_dec');
const iLon = col('prim_long_dec');
if ([iName, iClass, iLat, iLon].some((i) => i < 0)) {
  console.error('[labels] unexpected GNIS header:', header.join(','));
  process.exit(1);
}

const features = [];
for (const line of lines.slice(1)) {
  const parts = line.split('|');
  const cls = CLASSES[parts[iClass]];
  if (!cls) continue;
  const lat = Number(parts[iLat]);
  const lon = Number(parts[iLon]);
  const name = (parts[iName] ?? '').trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lon.toFixed(5)), Number(lat.toFixed(5))] },
    properties: { n: name, c: cls.c, mz: cls.mz, p: cls.p },
  });
}

mkdirSync('public/labels', { recursive: true });
const out = 'public/labels/maine-places.json';
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
const kb = Math.round(JSON.stringify({ type: 'FeatureCollection', features }).length / 1024);
console.log(`[labels] wrote ${out}: ${features.length} places, ~${kb} KB`);
