/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Injected at BUILD time only — dev mode needs Vite's inline HMR preamble,
// which a strict script-src would block. Second layer of defense: every DOM
// sink already avoids HTML injection, but one future innerHTML with an AIS
// vessel name would otherwise be fully exploitable.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // MapLibre + React inline styles
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:", // MapLibre spawns blob: workers
  "manifest-src 'self'",
  // ws://localhost:3000 = SignalK on the Pi; NOAA + NWS APIs; aisstream.io =
  // the internet AIS shore relay (src/signalk/aisStream.ts). Charts are
  // same-origin ('self') — release assets can't be browser-fetched (no CORS).
  "connect-src 'self' ws://localhost:3000 wss://stream.aisstream.io https://api.weather.gov https://api.tidesandcurrents.noaa.gov",
].join('; ');

export default defineConfig({
  // GitHub Pages serves from /<repo>/ — the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml(html: string) {
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
              injectTo: 'head-prepend' as const,
            },
          ],
        };
      },
    },
    // Installable offline PWA (the phone build; harmless on the Pi, which
    // serves from localhost). App shell + fonts + tide data are precached;
    // the multi-hundred-MB PMTiles charts are explicitly NOT precached —
    // they download once via src/pwa/chartCache.ts into the 'charts' cache,
    // and the rangeRequests plugin below serves MapLibre's byte-range reads
    // from that full cached copy when offline.
    VitePWA({
      // 'prompt', NOT 'autoUpdate': autoUpdate reloads the page the moment a
      // new service worker activates — the app restarting itself ~10s after
      // launch, mid-read or (worse) mid-passage. The UpdatePill surfaces
      // "update ready" and the operator applies it when THEY choose; a plain
      // close-and-reopen still applies it too.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'GATOR',
        short_name: 'GATOR',
        description: 'Chart, tides, and navigation display for small boats',
        display: 'standalone',
        background_color: '#142038',
        theme_color: '#142038',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,pbf}'],
        // Chart files are never precached (300 MB would break install) and
        // are NOT served through the SW at all: a custom pmtiles Source
        // (src/chart/style/chartSource.ts) reads byte ranges directly from
        // the chunked cache written by src/pwa/chartCache.ts. Single giant
        // cache entries fail in real browsers ("Unexpected internal error"
        // on put), which is why the chunked design exists.
        globIgnores: ['charts/**'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Localhost by default — an open dev server on marina/cafe wifi serves
    // your source to anyone. For cross-device testing: npm run dev -- --host
    port: 5173,
  },
  test: {
    // Playwright owns e2e/; Vitest only sees src/ unit tests.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
