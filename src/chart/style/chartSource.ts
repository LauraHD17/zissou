// Custom pmtiles Source: serves byte ranges from the chunked offline cache
// when present, falling back to HTTP Range requests when not (dev, the Pi,
// or a phone that hasn't downloaded charts yet). Registered on the MapLibre
// pmtiles Protocol instance keyed by the chart URL, so the style's
// pmtiles://<url> references resolve here instead of to plain fetch.

import type { Source, RangeResponse } from 'pmtiles';
import { readChartBytes } from '../../pwa/chartCache';

export class CachedChartSource implements Source {
  constructor(private url: string) {}

  getKey(): string {
    return this.url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const cached = await readChartBytes(this.url, offset, length);
    if (cached) return { data: cached };

    const res = await fetch(this.url, {
      signal,
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (res.status === 206 || res.status === 200) {
      return { data: await res.arrayBuffer() };
    }
    throw new Error(`chart fetch failed: HTTP ${res.status}`);
  }
}
