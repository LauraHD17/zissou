#!/usr/bin/env node
// Emit the day + night navaid sprite source SVGs under sprites/navaid/{day,night}/.
// Keeps both palettes in lockstep — adding a shape here produces both variants.
// Run: `node scripts/generate-navaid-sprites.mjs`. The output files are committed;
// `npm run build:sprites` bundles them into public/sprites/navaid{,-night}.{png,json}.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const PALETTES = {
  day: {
    port: '#C2185B',
    starboard: '#0E8C43',
    safeWater: '#D62E38',
    cardinal: '#F5B800',
    isolated: '#1A1A1A',
    special: '#F5B800',
    lightGlow: '#FF6FD8',
    wreck: '#7B1FA2',
    sand: '#F0EBE0',
    navy: '#142038',
  },
  night: {
    port: '#B33A4A',
    starboard: '#995522',
    safeWater: '#CC5544',
    cardinal: '#CC6622',
    isolated: '#331010',
    special: '#CC6622',
    lightGlow: '#FF7744',
    wreck: '#992233',
    sand: '#2D1010',
    navy: '#E89A89', // warm text color — used for strokes in night
  },
};

// Each glyph is a function of the palette → SVG markup. Viewbox 20×20. Width/
// height are unset so spritezero scales at bundle time. `strokeWidth="1"` on
// all outlined shapes gives the 3:1 non-text contrast WCAG 1.4.11 requires
// against any chart backdrop (water slate or sand land tile).
const GLYPHS = {
  'lateral-port-buoy': (p) => `
    <rect x="6" y="4" width="8" height="10" fill="${p.port}" stroke="${p.navy}" stroke-width="1"/>
    <path d="M4 16 L16 16" stroke="${p.navy}" stroke-width="1.5"/>
    <path d="M7 17 Q9 18 11 17 T15 17" stroke="${p.navy}" stroke-width="0.8" fill="none" opacity="0.6"/>
  `,
  'lateral-port-beacon': (p) => `
    <rect x="6" y="4" width="8" height="8" fill="${p.port}" stroke="${p.navy}" stroke-width="1"/>
    <rect x="9" y="12" width="2" height="6" fill="${p.navy}"/>
    <rect x="5" y="17" width="10" height="2" fill="${p.navy}"/>
  `,
  'lateral-starboard-buoy': (p) => `
    <polygon points="5,14 15,14 12,4 8,4" fill="${p.starboard}" stroke="${p.navy}" stroke-width="1"/>
    <path d="M4 16 L16 16" stroke="${p.navy}" stroke-width="1.5"/>
    <path d="M7 17 Q9 18 11 17 T15 17" stroke="${p.navy}" stroke-width="0.8" fill="none" opacity="0.6"/>
  `,
  'lateral-starboard-beacon': (p) => `
    <polygon points="6,12 14,12 12,4 8,4" fill="${p.starboard}" stroke="${p.navy}" stroke-width="1"/>
    <rect x="9" y="12" width="2" height="6" fill="${p.navy}"/>
    <rect x="5" y="17" width="10" height="2" fill="${p.navy}"/>
  `,
  'safe-water-buoy': (p) => `
    <circle cx="10" cy="10" r="6" fill="${p.sand}" stroke="${p.navy}" stroke-width="1"/>
    <rect x="9" y="4" width="2" height="12" fill="${p.safeWater}"/>
    <path d="M4 17 Q7 18 10 17 T16 17" stroke="${p.navy}" stroke-width="0.8" fill="none" opacity="0.6"/>
  `,
  'safe-water-beacon': (p) => `
    <circle cx="10" cy="8" r="5" fill="${p.sand}" stroke="${p.navy}" stroke-width="1"/>
    <rect x="9" y="7" width="2" height="3" fill="${p.safeWater}"/>
    <rect x="9" y="13" width="2" height="5" fill="${p.navy}"/>
    <rect x="5" y="17" width="10" height="2" fill="${p.navy}"/>
  `,
  // Cardinal topmarks per IALA: N = both points up, E = point-apart (diamond),
  // S = both points down, W = point-together (hourglass).
  'cardinal-north': (p) => `
    <polygon points="10,2 7,5 13,5" fill="${p.navy}"/>
    <polygon points="10,6 7,9 13,9" fill="${p.navy}"/>
    <rect x="7" y="10" width="6" height="3" fill="${p.cardinal}"/>
    <rect x="7" y="13" width="6" height="3" fill="${p.navy}"/>
    <path d="M4 18 L16 18" stroke="${p.navy}" stroke-width="1"/>
  `,
  'cardinal-east': (p) => `
    <polygon points="7,2 13,2 10,5" fill="${p.navy}"/>
    <polygon points="7,9 13,9 10,6" fill="${p.navy}"/>
    <rect x="7" y="10" width="6" height="2" fill="${p.cardinal}"/>
    <rect x="7" y="12" width="6" height="2" fill="${p.navy}"/>
    <rect x="7" y="14" width="6" height="2" fill="${p.cardinal}"/>
    <path d="M4 18 L16 18" stroke="${p.navy}" stroke-width="1"/>
  `,
  'cardinal-south': (p) => `
    <polygon points="7,2 13,2 10,5" fill="${p.navy}"/>
    <polygon points="7,6 13,6 10,9" fill="${p.navy}"/>
    <rect x="7" y="10" width="6" height="3" fill="${p.navy}"/>
    <rect x="7" y="13" width="6" height="3" fill="${p.cardinal}"/>
    <path d="M4 18 L16 18" stroke="${p.navy}" stroke-width="1"/>
  `,
  'cardinal-west': (p) => `
    <polygon points="10,2 7,5 13,5" fill="${p.navy}"/>
    <polygon points="7,6 13,6 10,9" fill="${p.navy}"/>
    <rect x="7" y="10" width="6" height="2" fill="${p.cardinal}"/>
    <rect x="7" y="12" width="6" height="2" fill="${p.navy}"/>
    <rect x="7" y="14" width="6" height="2" fill="${p.cardinal}"/>
    <path d="M4 18 L16 18" stroke="${p.navy}" stroke-width="1"/>
  `,
  'isolated-danger': (p) => `
    <circle cx="10" cy="4" r="2.2" fill="${p.isolated}"/>
    <circle cx="10" cy="9" r="2.2" fill="${p.isolated}"/>
    <rect x="8" y="12" width="4" height="5" fill="${p.port}"/>
    <rect x="8" y="12" width="4" height="1.5" fill="${p.isolated}"/>
    <rect x="8" y="15.5" width="4" height="1.5" fill="${p.isolated}"/>
  `,
  'special-buoy': (p) => `
    <path d="M5 5 L15 15" stroke="${p.special}" stroke-width="3" stroke-linecap="round"/>
    <path d="M15 5 L5 15" stroke="${p.special}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="10" cy="10" r="2" fill="${p.special}" stroke="${p.navy}" stroke-width="0.8"/>
  `,
  'light': (p) => `
    <g stroke="${p.lightGlow}" stroke-width="1.5" stroke-linecap="round">
      <path d="M10 2 L10 18"/>
      <path d="M2 10 L18 10"/>
      <path d="M4 4 L16 16"/>
      <path d="M16 4 L4 16"/>
    </g>
    <circle cx="10" cy="10" r="2" fill="${p.lightGlow}" stroke="${p.navy}" stroke-width="0.6"/>
  `,
  'wreck': (p) => `
    <path d="M4 4 L16 16" stroke="${p.wreck}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M16 4 L4 16" stroke="${p.wreck}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="6" cy="6" r="1.1" fill="${p.wreck}"/>
    <circle cx="14" cy="6" r="1.1" fill="${p.wreck}"/>
    <path d="M3 16 Q6 17 9 16 T15 16" stroke="${p.wreck}" stroke-width="0.8" fill="none" opacity="0.7"/>
  `,
  'obstruction': (p) => `
    <circle cx="10" cy="10" r="6" fill="none" stroke="${p.wreck}" stroke-width="1.5"/>
    <path d="M5.5 5.5 L14.5 14.5" stroke="${p.wreck}" stroke-width="1"/>
    <path d="M14.5 5.5 L5.5 14.5" stroke="${p.wreck}" stroke-width="1"/>
  `,
};

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">${body.trim()}</svg>\n`;
}

for (const [theme, palette] of Object.entries(PALETTES)) {
  const dir = resolve(repoRoot, 'sprites', 'navaid', theme);
  mkdirSync(dir, { recursive: true });
  for (const [name, build] of Object.entries(GLYPHS)) {
    const file = resolve(dir, `${name}.svg`);
    writeFileSync(file, svg(build(palette)));
  }
  console.log(`[navaid-sprites] wrote ${Object.keys(GLYPHS).length} files to ${dir}`);
}
