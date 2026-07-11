// Single source of truth for where the PMTiles chart files live.
//
// Default: same-origin under the app's base path — `/charts/` in dev and on
// the Pi, `/zissou/charts/` on GitHub Pages (the deploy workflow copies the
// files out of the charts-v1 release into the site, because browsers cannot
// fetch release assets directly: release-assets.githubusercontent.com sends
// no CORS headers). VITE_CHARTS_BASE remains as an escape hatch for hosting
// the charts elsewhere; any such host MUST send CORS headers and support
// Range requests.

const RAW_BASE =
  (import.meta.env.VITE_CHARTS_BASE as string | undefined) ?? `${import.meta.env.BASE_URL}charts`;
export const CHARTS_BASE = RAW_BASE.replace(/\/$/, '');

// NOTE: bumping a filename here (e.g. maine-base-v2.pmtiles) is the cache-
// invalidation mechanism for chart updates on installed phones — the
// download pill reappears and fetches only the changed file.
export const CHART_FILES = ['maine-base.pmtiles', 'maine.pmtiles'] as const;

export function chartUrl(file: (typeof CHART_FILES)[number]): string {
  return `${CHARTS_BASE}/${file}`;
}

export function pmtilesUrl(file: (typeof CHART_FILES)[number]): string {
  return `pmtiles://${chartUrl(file)}`;
}
