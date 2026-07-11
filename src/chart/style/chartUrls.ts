// Single source of truth for where the PMTiles chart files live.
//
// Default: same-origin /charts/ (dev server + the Pi, where the files sit on
// disk). Phone/PWA builds override VITE_CHARTS_BASE with an absolute URL —
// static hosts like GitHub Pages cap file sizes well below a 290 MB chart,
// so the files are published as GitHub Release assets (2 GB/file, CORS and
// Range requests supported) and cached on-device by the service worker.

const RAW_BASE = (import.meta.env.VITE_CHARTS_BASE as string | undefined) ?? '/charts';
export const CHARTS_BASE = RAW_BASE.replace(/\/$/, '');

export const CHART_FILES = ['maine-base.pmtiles', 'maine.pmtiles'] as const;

export function chartUrl(file: (typeof CHART_FILES)[number]): string {
  return `${CHARTS_BASE}/${file}`;
}

export function pmtilesUrl(file: (typeof CHART_FILES)[number]): string {
  return `pmtiles://${chartUrl(file)}`;
}
