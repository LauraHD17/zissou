// Guard: unit-conversion constants live ONLY in src/utils/units.ts. A
// hand-retyped constant elsewhere can drift (truncated digits, wrong
// direction) and silently skew a depth or speed readout — the exact class of
// error the math cross-check suites exist to catch. If this test fails,
// import the conversion from units.ts instead of retyping the number.
//
// Test files are exempt (they intentionally re-derive constants as oracles).

import { describe, expect, it } from 'vitest';

// Vite pulls every source file in as a raw string at transform time — no
// node:fs needed, so this test typechecks under the browser-only tsconfig.
const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BANNED: { name: string; pattern: RegExp }[] = [
  { name: 'm→ft (3.28084 / 3.2808…)', pattern: /3\.2808/ },
  { name: 'ft→m (0.3048)', pattern: /0\.3048/ },
  { name: 'm/s→kn (1.9438…)', pattern: /1\.9438/ },
  { name: 'm/s→mph (2.2369…)', pattern: /2\.2369/ },
  { name: 'nm→mi (1.15077…)', pattern: /1\.1507/ },
  { name: 'm→yd (1.0936…)', pattern: /1\.0936/ },
  { name: 'mile in meters (1609.344)', pattern: /1609\.344/ },
  // Digit/decimal boundaries so coordinates like -68.1852 don't false-positive.
  { name: 'nm in meters (1852)', pattern: /(?<![\d.])1852(?![\d.])/ },
];

describe('conversion constants have a single source of truth', () => {
  it('no conversion literals outside src/utils/units.ts', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith('/units.ts')) continue;
      if (/\.test\.tsx?$/.test(path)) continue;
      const lines = text.split('\n');
      for (const { name, pattern } of BANNED) {
        lines.forEach((line, i) => {
          if (pattern.test(line)) {
            offenders.push(`${path}:${i + 1} — ${name}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders, `Import from units.ts instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
