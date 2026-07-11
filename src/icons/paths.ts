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
  sunrise: 'M 2 18 h 20 M 7 18 a 5 5 0 0 1 10 0 M 12 8 v -5 M 9.5 5.5 L 12 3 L 14.5 5.5',
  // Sun half above horizon + down arrow.
  sunset: 'M 2 18 h 20 M 7 18 a 5 5 0 0 1 10 0 M 12 3 v 5 M 9.5 5.5 L 12 8 L 14.5 5.5',
  // One three-crowned wave (left) + separate ↗ NE-diagonal arrow (right).
  tideRising: 'M 2 17 q 1.67 -3 3.33 0 t 3.33 0 t 3.33 0 M 14 17 L 22 7 M 22 12 L 22 7 L 17 7',
  // One three-crowned wave (left) + separate ↘ SE-diagonal arrow (right).
  tideFalling: 'M 2 17 q 1.67 -3 3.33 0 t 3.33 0 t 3.33 0 M 14 7 L 22 17 M 22 12 L 22 17 L 17 17',

  // ── Theme toggle (day / night) ─────────────────────────────────────
  // Sun: filled-look circle with 8 short rays (rendered as stroke).
  sun: 'M 12 12 m -3.5 0 a 3.5 3.5 0 1 0 7 0 a 3.5 3.5 0 1 0 -7 0 M 12 3 v 2 M 12 19 v 2 M 3 12 h 2 M 19 12 h 2 M 5.6 5.6 l 1.4 1.4 M 17 17 l 1.4 1.4 M 18.4 5.6 l -1.4 1.4 M 7 17 l -1.4 1.4',
  // Crescent moon — single curved path.
  moon: 'M 18 14 a 7 7 0 1 1 -8 -10 a 6 6 0 0 0 8 10 z',

  // ── Anchor (anchor-watch button + anchorage waypoint category) ─────
  // Minimal line-art: crown circle, vertical shank, horizontal stock,
  // two arc-arms sweeping down to imply flukes.
  anchor:
    'M 12 4 m -2 0 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0 M 12 6 v 13 M 8 9 h 8 M 12 19 q -7 0 -7 -5 M 12 19 q 7 0 7 -5',

  // ── Waypoint markers + entry button ────────────────────────────────
  // Pin: inverted teardrop with a small inner circle (drop-pin / Go-To dest).
  pin: 'M 12 2 c 4 0 7 3 7 7 c 0 5 -7 13 -7 13 c 0 0 -7 -8 -7 -13 c 0 -4 3 -7 7 -7 M 12 9 m -2 0 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0',
  // Three-dot kebab — "more" entry to waypoints panel.
  more: 'M 12 5 m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0 M 12 12 m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0 M 12 19 m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0',

  // ── Waypoint category icons (sage when rendered on chart) ──────────
  // Mooring buoy — small ball + vertical stem with eye on top.
  mooringBuoy:
    'M 12 16 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0 M 12 12 v -5 M 12 6 m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0',
  // Warning — `!` inside an upward triangle. International caution glyph.
  warning:
    'M 12 3 L 22 20 L 2 20 Z M 12 9 v 5 M 12 17 m -0.5 0 a 0.5 0.5 0 1 0 1 0 a 0.5 0.5 0 1 0 -1 0',
  // Star — 5-point outline.
  star: 'M 12 2 L 14.5 9 L 22 9 L 16 14 L 18 22 L 12 17.5 L 6 22 L 8 14 L 2 9 L 9.5 9 Z',

  // ── MOB (man overboard) ────────────────────────────────────────────
  // Head silhouette over two wavy water lines — reads as "person in water"
  // at glyph scale. Distinctive vs warning triangle and waypoint icons.
  mob: 'M 12 5 m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0 M 2 14 q 5 -3 10 0 t 10 0 M 2 18 q 5 -3 10 0 t 10 0',

  // ── Settings (opens user-prefs slide-panel) ────────────────────────
  // Minimal gear: octagonal outline + center circle. Stroke-only so it
  // reads at the 20px StatusBar scale without visual weight.
  gear: 'M 10 3 h 4 l 0.5 2.2 l 2 1 l 2 -0.7 l 2 3.5 l -1.5 1.5 v 2 l 1.5 1.5 l -2 3.5 l -2 -0.7 l -2 1 l -0.5 2.2 h -4 l -0.5 -2.2 l -2 -1 l -2 0.7 l -2 -3.5 l 1.5 -1.5 v -2 l -1.5 -1.5 l 2 -3.5 l 2 0.7 l 2 -1 z M 12 12 m -2.5 0 a 2.5 2.5 0 1 0 5 0 a 2.5 2.5 0 1 0 -5 0',

  // ── Label-priority button (chart controls) ─────────────────────────
  // Luggage/price tag — pentagonal body with an angled corner and a small
  // circular string-hole. Reads universally as "label" and makes the
  // tri-state cycle (balanced / place / depth) obviously about annotations.
  tag: 'M 20 12 l -8 8 l -10 -10 v -7 h 7 z M 7 7 m -1.3 0 a 1.3 1.3 0 1 0 2.6 0 a 1.3 1.3 0 1 0 -2.6 0',

  // ── Layers button (chart controls) ─────────────────────────────────
  // Three stacked rhombi — top layer drawn closed, second and third as
  // chevrons beneath. Reads as "stack of sheets" / map layers. Distinct
  // from the wave icon (wavy horizontals) and marina glyphs. Used to
  // open the chart-layers panel.
  layers: 'M 12 3 L 21 9 L 12 15 L 3 9 Z M 3 13 L 12 19 L 21 13 M 3 17 L 12 21 L 21 17',

  // ── Hazard waypoint ────────────────────────────────────────────────
  // Bold standalone "!" — tapered bar over a disc. Designed as a closed
  // path so it renders filled (red) with a thick outline (yellow-green)
  // per the waypoint-marker style override. No surrounding triangle —
  // the color combo does the "watch out" signaling without geometry
  // that could be confused with the own-ship triangle.
  hazard: 'M 9.5 3 L 14.5 3 L 13 15 L 11 15 Z M 12 19 m -2 0 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0',
} as const;

export type IconName = keyof typeof ICON_PATHS;
