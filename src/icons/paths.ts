// Single source of truth for icon SVG paths. All icons share viewBox 0 0 24 24.
// Paths use currentColor for stroke; never hardcode color here — callers control
// via CSS. Rendered by both <Icon> (JSX) and buildIconElement (DOM) so chart
// markers and React UI stay visually consistent.

export const ICON_PATHS = {
  // ── Mode toggle (replaces ⚓; swaps based on current mode) ───────────
  // Three soft horizontal water lines.
  wave: 'M 3 8 q 3 -3 6 0 t 6 0 t 6 0 M 3 12 q 3 -3 6 0 t 6 0 t 6 0 M 3 16 q 3 -3 6 0 t 6 0 t 6 0',
  // Simple street-grid cross.
  streets: 'M 2 12 h 20 M 12 2 v 20',

  // ── Map control ────────────────────────────────────────────────────
  // Crosshair / target circle with center dot. Center dot is a tiny circle
  // path (two arcs) rather than a fill so it inherits stroke color.
  recenter:
    'M 4 12 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M 12 2 v 3 M 12 19 v 3 M 2 12 h 3 M 19 12 h 3 M 11 12 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0',

  // ── StatusBar almanac (replaces ☀↗ ☀↘ 〰↗ 〰↘) ─────────────────────
  // Sun half above horizon + up arrow.
  sunrise:
    'M 2 18 h 20 M 7 18 a 5 5 0 0 1 10 0 M 12 8 v -5 M 9.5 5.5 L 12 3 L 14.5 5.5',
  // Sun half above horizon + down arrow.
  sunset:
    'M 2 18 h 20 M 7 18 a 5 5 0 0 1 10 0 M 12 3 v 5 M 9.5 5.5 L 12 8 L 14.5 5.5',
  // Wave + up arrow.
  tideRising:
    'M 2 16 q 3 -3 6 0 t 6 0 t 6 0 M 19 11 v -7 M 16.5 6.5 L 19 4 L 21.5 6.5',
  // Wave + down arrow.
  tideFalling:
    'M 2 16 q 3 -3 6 0 t 6 0 t 6 0 M 19 4 v 7 M 16.5 8.5 L 19 11 L 21.5 8.5',

  // ── Anchor (anchor-watch button + anchorage waypoint category) ─────
  // Minimal line-art: crown circle, vertical shank, horizontal stock,
  // two arc-arms sweeping down to imply flukes.
  anchor:
    'M 12 4 m -2 0 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0 M 12 6 v 13 M 8 9 h 8 M 12 19 q -7 0 -7 -5 M 12 19 q 7 0 7 -5',
} as const;

export type IconName = keyof typeof ICON_PATHS;
