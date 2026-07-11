#!/usr/bin/env node
// Bundle sprites/navaid/{day,night}/*.svg into MapLibre-compatible sprite
// atlases under public/sprites/. Replaces @mapbox/spritezero-cli, which
// failed to install on Node 24 due to a native mapnik dependency.
//
// Output per theme:
//   public/sprites/navaid.{png,json}           — 1x
//   public/sprites/navaid@2x.{png,json}        — 2x retina
//   public/sprites/navaid-night.{png,json}     — 1x night
//   public/sprites/navaid-night@2x.{png,json}  — 2x retina night
//
// MapLibre sprite spec: https://maplibre.org/maplibre-style-spec/sprite/

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// All glyphs are authored at 20×20. Sprite renders at this native size;
// MapLibre's symbol-layer icon-size scales from there.
const NATIVE_SIZE = 20;

// Single-column layout — each sprite is NATIVE_SIZE × NATIVE_SIZE so we
// just stack them vertically. Keeps the atlas tiny and the JSON trivial.
async function buildTheme(themeName, outName) {
  const srcDir = resolve(repoRoot, 'sprites', 'navaid', themeName);
  const files = readdirSync(srcDir)
    .filter((f) => f.endsWith('.svg'))
    .sort();

  for (const pixelRatio of [1, 2]) {
    const size = NATIVE_SIZE * pixelRatio;
    const atlasHeight = size * files.length;
    const manifest = {};
    const rows = [];

    for (let i = 0; i < files.length; i++) {
      const name = files[i].replace(/\.svg$/, '');
      const svgBuf = readFileSync(join(srcDir, files[i]));
      const png = await sharp(svgBuf, { density: 72 * pixelRatio })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      rows.push({ input: png, top: i * size, left: 0 });
      manifest[name] = {
        width: size,
        height: size,
        x: 0,
        y: i * size,
        pixelRatio,
      };
    }

    const atlas = await sharp({
      create: {
        width: size,
        height: atlasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(rows)
      .png()
      .toBuffer();

    const outDir = resolve(repoRoot, 'public', 'sprites');
    mkdirSync(outDir, { recursive: true });
    const suffix = pixelRatio === 2 ? '@2x' : '';
    writeFileSync(join(outDir, `${outName}${suffix}.png`), atlas);
    writeFileSync(join(outDir, `${outName}${suffix}.json`), JSON.stringify(manifest, null, 2));
    console.log(
      `[navaid-sprites] ${outName}${suffix}: ${files.length} icons @ ${size}px → ${size}×${atlasHeight}`,
    );
  }
}

await buildTheme('day', 'navaid');
await buildTheme('night', 'navaid-night');
