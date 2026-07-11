// Offline chart storage for the phone/PWA build — CHUNKED.
//
// A PMTiles chart is ~300 MB. Storing it as ONE Cache entry fails in real
// browsers ("Failed to execute 'put' on 'Cache': Unexpected internal
// error" in Chromium; old-iOS WebKit is worse) — large single writes are
// the problem, not total quota. So the download step slices the stream
// into 32 MiB chunk entries plus a small meta record, and the chart engine
// reads byte ranges straight out of the chunks via a custom pmtiles Source
// (src/chart/style/chartSource.ts). The service worker is NOT involved in
// chart serving at all.
//
// Cache layout per chart URL:
//   <url>?meta     JSON { size, chunkBytes, chunks }   (written LAST —
//                  its presence marks a complete download)
//   <url>?chunk=N  binary chunk N (all 32 MiB except the final one)

import { CHART_FILES, chartUrl } from '../chart/style/chartUrls';

export const CHART_CACHE_NAME = 'charts';
export const CHUNK_BYTES = 32 * 1024 * 1024;

interface ChartMeta {
  size: number;
  chunkBytes: number;
  chunks: number;
}

function metaKey(url: string): string {
  return `${url}?meta`;
}

function chunkKey(url: string, i: number): string {
  return `${url}?chunk=${i}`;
}

function cacheApiAvailable(): boolean {
  return typeof caches !== 'undefined';
}

async function readMeta(cache: Cache, url: string): Promise<ChartMeta | null> {
  const res = await cache.match(metaKey(url));
  if (!res) return null;
  try {
    const m = (await res.json()) as ChartMeta;
    if (!Number.isFinite(m.size) || !Number.isFinite(m.chunkBytes) || !Number.isFinite(m.chunks)) {
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

async function deleteChart(cache: Cache, url: string): Promise<void> {
  await cache.delete(metaKey(url));
  // Delete a generous range — covers partial downloads with older chunk sizes.
  for (let i = 0; i < 64; i++) await cache.delete(chunkKey(url, i));
}

/** Are all chart files fully cached for offline use? */
export async function chartsCached(): Promise<boolean> {
  if (!cacheApiAvailable()) return false;
  const cache = await caches.open(CHART_CACHE_NAME);
  for (const f of CHART_FILES) {
    if (!(await readMeta(cache, chartUrl(f)))) return false;
  }
  return true;
}

/** Per-file byte sizes via HEAD requests, ONLY for files not yet cached —
 *  the pill's size label and the progress denominator must reflect what
 *  will actually download (e.g. a 13 MB base-chart update, not 300 MB). */
async function chartSizes(): Promise<Map<string, number> | null> {
  try {
    const cache = cacheApiAvailable() ? await caches.open(CHART_CACHE_NAME) : null;
    const sizes = new Map<string, number>();
    for (const f of CHART_FILES) {
      if (cache && (await readMeta(cache, chartUrl(f)))) continue; // already complete
      const r = await fetch(chartUrl(f), { method: 'HEAD' });
      const len = Number(r.headers.get('content-length'));
      if (!r.ok || !Number.isFinite(len) || len <= 0) return null;
      sizes.set(f, len);
    }
    return sizes;
  } catch {
    return null;
  }
}

/** Total bytes still to download. null if unknown. */
export async function chartsTotalBytes(): Promise<number | null> {
  const sizes = await chartSizes();
  if (!sizes) return null;
  let total = 0;
  for (const n of sizes.values()) total += n;
  return total;
}

// Every PMTiles v3 archive begins with the ASCII bytes "PMTiles". Verifying
// this catches the classic marina-wifi failure: a captive portal answering
// every request with an HTML login page and status 200 — which would
// otherwise be saved and served as a "chart".
const PMTILES_MAGIC = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73];

async function verifyChart(
  cache: Cache,
  url: string,
  fileBytes: number,
  expectedBytes: number | undefined,
): Promise<void> {
  if (expectedBytes != null && fileBytes !== expectedBytes) {
    throw new Error(
      `truncated download — got ${fileBytes} of ${expectedBytes} bytes; check the connection and retry`,
    );
  }
  const head = await cache.match(chunkKey(url, 0));
  if (!head) throw new Error('verification failed — first chunk missing');
  const first = new Uint8Array(
    await (await head.blob()).slice(0, PMTILES_MAGIC.length).arrayBuffer(),
  );
  if (!PMTILES_MAGIC.every((b, i) => first[i] === b)) {
    throw new Error(
      'downloaded data is not a chart file — a wifi login page may have intercepted the download',
    );
  }
}

export interface DownloadProgress {
  /** 0..1, or null when total size is unknown. */
  fraction: number | null;
  receivedBytes: number;
}

/**
 * Download every chart file into chunked cache entries. Throws with a
 * descriptive message on failure. Already-complete files are skipped, so a
 * failed run resumes at the file level on retry. Memory use is bounded at
 * one chunk (32 MiB) regardless of file size.
 */
export async function downloadCharts(onProgress: (p: DownloadProgress) => void): Promise<void> {
  if (!cacheApiAvailable()) throw new Error('offline storage unavailable in this browser');
  const cache = await caches.open(CHART_CACHE_NAME);
  const sizes = await chartSizes();
  let total: number | null = null;
  if (sizes) {
    total = 0;
    for (const n of sizes.values()) total += n;
  }
  let received = 0;

  for (const f of CHART_FILES) {
    const url = chartUrl(f);
    if (await readMeta(cache, url)) continue;
    await deleteChart(cache, url); // clear any partial leftovers first

    try {
      // no-store: don't let the HTTP cache buffer a second full copy.
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('empty response body');

      // Size verification is only meaningful when the transfer is NOT
      // compressed: with content-encoding (GitHub Pages gzips these), the
      // declared length counts compressed bytes while we receive
      // decompressed ones. Compressed transfers are self-verifying — a
      // truncated gzip stream fails in the browser's decoder.
      const encoding = (res.headers.get('content-encoding') ?? '').toLowerCase();
      const declared = Number(res.headers.get('content-length'));
      const expectedBytes =
        (!encoding || encoding === 'identity') && Number.isFinite(declared) && declared > 0
          ? declared
          : undefined;

      const reader = res.body.getReader();
      let pending: Uint8Array[] = [];
      let pendingBytes = 0;
      let fileBytes = 0;
      let chunkIndex = 0;

      const flush = async () => {
        if (pendingBytes === 0) return;
        const buf = new Uint8Array(pendingBytes);
        let off = 0;
        for (const part of pending) {
          buf.set(part, off);
          off += part.byteLength;
        }
        pending = [];
        pendingBytes = 0;
        await cache.put(
          chunkKey(url, chunkIndex),
          new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }),
        );
        chunkIndex++;
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let view = value;
        fileBytes += view.byteLength;
        received += view.byteLength;
        onProgress({
          fraction: total ? Math.min(1, received / total) : null,
          receivedBytes: received,
        });
        // Split the incoming piece across chunk boundaries as needed.
        while (pendingBytes + view.byteLength >= CHUNK_BYTES) {
          const take = CHUNK_BYTES - pendingBytes;
          pending.push(view.subarray(0, take));
          pendingBytes += take;
          await flush();
          view = view.subarray(take);
        }
        if (view.byteLength > 0) {
          pending.push(view);
          pendingBytes += view.byteLength;
        }
      }
      await flush();

      // Redundancy: verify size + PMTiles magic BEFORE writing the meta
      // record — meta's presence is the "download is complete and valid"
      // marker, so bad data can never look finished.
      await verifyChart(cache, url, fileBytes, expectedBytes);

      const meta: ChartMeta = { size: fileBytes, chunkBytes: CHUNK_BYTES, chunks: chunkIndex };
      await cache.put(
        metaKey(url),
        new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }),
      );
    } catch (e) {
      await deleteChart(cache, url);
      throw new Error(`${f}: ${e instanceof Error ? `${e.name} — ${e.message}` : String(e)}`, {
        cause: e,
      });
    }
  }
  onProgress({ fraction: 1, receivedBytes: received });
}

/**
 * Read [offset, offset+length) from a cached chunked chart. Returns null
 * when the chart isn't (fully) cached — caller falls back to the network.
 */
export async function readChartBytes(
  url: string,
  offset: number,
  length: number,
): Promise<ArrayBuffer | null> {
  if (!cacheApiAvailable() || length <= 0) return null;
  const cache = await caches.open(CHART_CACHE_NAME);
  const meta = await readMeta(cache, url);
  if (!meta) return null;

  const end = Math.min(offset + length, meta.size); // exclusive
  if (offset >= meta.size) return new ArrayBuffer(0);

  const firstChunk = Math.floor(offset / meta.chunkBytes);
  const lastChunk = Math.floor((end - 1) / meta.chunkBytes);
  const out = new Uint8Array(end - offset);
  let written = 0;

  for (let i = firstChunk; i <= lastChunk; i++) {
    const res = await cache.match(chunkKey(url, i));
    if (!res) return null; // corrupt/partial — treat as uncached
    const chunkStart = i * meta.chunkBytes;
    const sliceFrom = Math.max(0, offset - chunkStart);
    const sliceTo = Math.min(meta.chunkBytes, end - chunkStart);
    const blob = (await res.blob()).slice(sliceFrom, sliceTo);
    const buf = new Uint8Array(await blob.arrayBuffer());
    out.set(buf, written);
    written += buf.byteLength;
  }
  return out.buffer;
}
