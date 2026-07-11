// @vitest-environment jsdom
//
// Pins the chunked chart cache: download slicing, meta bookkeeping, and —
// most safety-critical — byte-exact range assembly across chunk boundaries.
// A wrong byte here is a corrupt chart on the water.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_BYTES, downloadCharts, chartsCached, readChartBytes } from './chartCache';
import { chartUrl } from '../chart/style/chartUrls';

// ── Map-backed stub of the Cache API ────────────────────────────────────
const stores = new Map<string, Map<string, Response>>();

function makeCache(name: string) {
  const store = stores.get(name) ?? new Map<string, Response>();
  stores.set(name, store);
  return {
    async match(key: string) {
      const r = store.get(key);
      return r ? r.clone() : undefined;
    },
    async put(key: string, res: Response) {
      // Consume the body eagerly like a real cache write.
      const buf = await res.arrayBuffer();
      store.set(key, new Response(buf, { headers: res.headers }));
    },
    async delete(key: string) {
      return store.delete(key);
    },
  };
}

// Deterministic pseudo-random bytes so any assembly slip shows up. Starts
// with the PMTiles magic so the download-time verification passes.
function patternBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + 7) % 251;
  const magic = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73];
  magic.forEach((b, i) => (out[i] = b));
  return out;
}

// Big enough to span >2 chunks without allocating 32 MiB in tests? CHUNK_BYTES
// is fixed at 32 MiB — allocating 2.5 chunks (80 MB) once is acceptable for a
// single test file and exercises the REAL chunk size rather than a toy one.
const BIG = Math.floor(CHUNK_BYTES * 2.5);
const bigData = patternBytes(BIG);
const smallData = patternBytes(1024);

beforeEach(() => {
  stores.clear();
  vi.stubGlobal('caches', {
    open: async (name: string) => makeCache(name),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const data = url.includes('maine-base') ? smallData : bigData;
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'content-length': String(data.byteLength) },
        });
      }
      // Raw bytes, not a Blob: jsdom's Blob is a different realm than
      // undici's Response, which would stringify it to "[object Blob]".
      return new Response(data.slice(), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadCharts', () => {
  it('slices into 32 MiB chunks with a meta record written last', async () => {
    const progress: number[] = [];
    await downloadCharts((p) => {
      if (p.fraction != null) progress.push(p.fraction);
    });

    expect(await chartsCached()).toBe(true);
    const store = stores.get('charts')!;
    const bigUrl = chartUrl('maine.pmtiles');
    const meta = JSON.parse(await store.get(`${bigUrl}?meta`)!.clone().text());
    expect(meta.size).toBe(BIG);
    expect(meta.chunks).toBe(3); // 2 full + 1 partial
    expect(store.has(`${bigUrl}?chunk=0`)).toBe(true);
    expect(store.has(`${bigUrl}?chunk=2`)).toBe(true);
    expect(store.has(`${bigUrl}?chunk=3`)).toBe(false);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('rejects a truncated download (stream ended early without error)', async () => {
    // Response-like object so the declared content-length can disagree with
    // the delivered body (real Response recomputes it for byte bodies).
    const shortBody = (data: Uint8Array) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data.slice(0, data.byteLength - 100));
          controller.close();
        },
      });
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const data = url.includes('maine-base') ? smallData : bigData;
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': String(data.byteLength) },
          });
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': String(data.byteLength) }),
          body: shortBody(data),
        } as unknown as Response;
      },
    );
    await expect(downloadCharts(() => {})).rejects.toThrow(/truncated download/);
    expect(await chartsCached()).toBe(false);
  });

  it('accepts a compressed transfer whose declared length is the COMPRESSED size', async () => {
    // Regression: GitHub Pages gzips chart transfers, so content-length
    // (compressed) is smaller than the decompressed byte count — that must
    // not be reported as truncation. The gzip decoder guards integrity.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const data = url.includes('maine-base') ? smallData : bigData;
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': String(Math.floor(data.byteLength * 0.8)) },
          });
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-length': String(Math.floor(data.byteLength * 0.8)),
            'content-encoding': 'gzip',
          }),
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(data.slice());
              controller.close();
            },
          }),
        } as unknown as Response;
      },
    );
    await downloadCharts(() => {});
    expect(await chartsCached()).toBe(true);
  });

  it('rejects a captive-portal HTML page masquerading as a chart', async () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><html>Marina wifi login</html>');
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': String(html.byteLength) },
          });
        }
        return new Response(html.slice(), { status: 200 });
      },
    );
    await expect(downloadCharts(() => {})).rejects.toThrow(/not a chart file/);
    expect(await chartsCached()).toBe(false);
  });

  it('failed downloads leave nothing behind and surface the reason', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('maine-base')) {
          if (init?.method === 'HEAD') {
            return new Response(null, {
              status: 200,
              headers: { 'content-length': String(smallData.byteLength) },
            });
          }
          return new Response(smallData.slice(), { status: 200 });
        }
        return new Response(null, { status: 503 });
      },
    );
    await expect(downloadCharts(() => {})).rejects.toThrow(/maine\.pmtiles: .*503/);
    expect(await chartsCached()).toBe(false);
    // The small file that succeeded earlier is kept (file-level resume).
    expect(stores.get('charts')!.has(`${chartUrl('maine-base.pmtiles')}?meta`)).toBe(true);
  });
});

describe('readChartBytes', () => {
  it('returns null when not cached (network fallback path)', async () => {
    expect(await readChartBytes(chartUrl('maine.pmtiles'), 0, 16)).toBeNull();
  });

  it('assembles byte-exact ranges, including across chunk boundaries', async () => {
    await downloadCharts(() => {});
    const url = chartUrl('maine.pmtiles');

    const cases: [number, number][] = [
      [0, 16], // head
      [CHUNK_BYTES - 8, 16], // spans chunk 0 → 1
      [CHUNK_BYTES * 2 - 5, 10], // spans chunk 1 → 2
      [BIG - 16, 16], // tail
      [12345, 1], // single byte
    ];
    for (const [offset, length] of cases) {
      const got = new Uint8Array((await readChartBytes(url, offset, length))!);
      expect(got, `range ${offset}+${length}`).toEqual(bigData.subarray(offset, offset + length));
    }
  });

  it('clamps reads past the end of the file', async () => {
    await downloadCharts(() => {});
    const url = chartUrl('maine.pmtiles');
    const got = await readChartBytes(url, BIG - 4, 100);
    expect(new Uint8Array(got!)).toEqual(bigData.subarray(BIG - 4));
    expect((await readChartBytes(url, BIG + 10, 4))!.byteLength).toBe(0);
  });
});
