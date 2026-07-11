// Offline chart storage for the phone/PWA build.
//
// MapLibre reads PMTiles with HTTP Range requests. The service worker
// (workbox, CacheFirst + rangeRequests on *.pmtiles) can serve any range
// from a cached FULL copy — but range responses can never seed that cache,
// so the full files must be downloaded explicitly once. This module owns
// that download: streamed fetch with progress, stored via the Cache API
// (disk-backed; a 290 MB chart never sits in JS memory thanks to tee()).
//
// Cache name MUST match the runtimeCaching cacheName in vite.config.ts.

import { CHART_FILES, chartUrl } from '../chart/style/chartUrls';

export const CHART_CACHE_NAME = 'charts';

function cacheApiAvailable(): boolean {
  return typeof caches !== 'undefined';
}

/** Are all chart files fully cached for offline use? */
export async function chartsCached(): Promise<boolean> {
  if (!cacheApiAvailable()) return false;
  const cache = await caches.open(CHART_CACHE_NAME);
  for (const f of CHART_FILES) {
    if (!(await cache.match(chartUrl(f)))) return false;
  }
  return true;
}

/** Total bytes to download, via HEAD requests. null if unknown. */
export async function chartsTotalBytes(): Promise<number | null> {
  try {
    let total = 0;
    for (const f of CHART_FILES) {
      const r = await fetch(chartUrl(f), { method: 'HEAD' });
      const len = Number(r.headers.get('content-length'));
      if (!r.ok || !Number.isFinite(len) || len <= 0) return null;
      total += len;
    }
    return total;
  } catch {
    return null;
  }
}

export interface DownloadProgress {
  /** 0..1, or null when total size is unknown. */
  fraction: number | null;
  receivedBytes: number;
}

/**
 * Download every chart file into the SW-visible cache. Resolves true on
 * full success. Already-cached files are skipped, so a failed run resumes
 * at the file level on retry.
 */
export async function downloadCharts(onProgress: (p: DownloadProgress) => void): Promise<boolean> {
  if (!cacheApiAvailable()) return false;
  const cache = await caches.open(CHART_CACHE_NAME);
  const total = await chartsTotalBytes();
  let received = 0;

  for (const f of CHART_FILES) {
    const url = chartUrl(f);
    if (await cache.match(url)) continue;

    const res = await fetch(url);
    if (!res.ok || !res.body) return false;

    // tee(): one branch streams to disk via cache.put, the other counts
    // progress — neither buffers the whole file in memory.
    const [toCache, toCount] = res.body.tee();
    const headers = new Headers();
    const contentType = res.headers.get('content-type');
    const contentLength = res.headers.get('content-length');
    if (contentType) headers.set('content-type', contentType);
    if (contentLength) headers.set('content-length', contentLength);

    const putPromise = cache.put(url, new Response(toCache, { status: 200, headers }));

    const reader = toCount.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      onProgress({
        fraction: total ? Math.min(1, received / total) : null,
        receivedBytes: received,
      });
    }

    try {
      await putPromise;
    } catch {
      // Quota exceeded (not enough free space) or write failure — drop the
      // partial entry so a retry starts clean for this file.
      await cache.delete(url);
      return false;
    }
  }
  onProgress({ fraction: 1, receivedBytes: received });
  return true;
}
