// Marine style tokens shared by MapLibre paint config across the chart.
//
// MapLibre paint can't read CSS custom properties, so we resolve them to hex
// at layer-ADD time via cssVar(). Extracted from marineStyle.ts so marker
// modules (heading vector, go-to route, anchor circle) don't pull in the whole
// NOAA-layer file just to reach a color.
//
// NOTE: values are read at layer-ADD time; a theme flip doesn't repaint
// already-added layers (night mode's <main> brightness filter dims them).

// Read a CSS custom property off :root (falls back to the provided default if
// the var is unset or we're running in a non-DOM environment like SSR/tests).
export function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Named accessors for the tokens used across MapLibre paint config. Each
// resolves the CSS var with a hex fallback so the map stays styled if CSS
// fails to load. Functions (not constants) because cssVar must run at
// layer-add time, not module-eval time — the DOM/:root may not be ready on
// import, and the value should reflect :root when the layer is actually added.
export const marineToken = {
  alertAmber: () => cssVar('--alert-amber', '#E8B84D'),
  alertRed: () => cssVar('--alert-red', '#8B1E12'),
  bgNavy: () => cssVar('--bg-navy', '#142038'),
  ownshipAccent: () => cssVar('--ownship-accent', '#CCFF00'),
} as const;

// Marine palette for the NOAA overlay layers (depth expressions + navaid
// symbol layers). Depth + feature colors are sourced from :root CSS vars so
// tokens stay in one place; fallbacks keep the chart styled if CSS fails to
// load. Evaluated once at module load — the layers that read it are added
// after the app (and its CSS) has mounted.
export const COLORS = {
  water: '#547A9E',
  land: '#F0EBE0',
  coastline: '#142038',
  roadMajor: '#9a9a9a',
  roadMinor: '#bfbfbf',
  labelStrong: '#142038',
  labelHalo: '#F0EBE0',
  depthShallow: cssVar('--depth-shallow', '#FF3B1A'), // < 1.83m (6ft)
  depthModerate: cssVar('--depth-mid', '#FFD700'), // 1.83 – 6.10m (6–20ft)
  depthDeep: cssVar('--depth-deep', '#6FECB0'), // > 6.10m (20ft+)
  buoy: cssVar('--alert-amber', '#E8B84D'),
  buoyOutline: cssVar('--bg-navy', '#142038'),
  wreck: cssVar('--alert-red', '#8B1E12'),
};
