// Self-contained MapLibre style for offline operation. Replaces the former
// OpenFreeMap CDN dependency — every asset (fonts, glyphs, tiles, sprites)
// is served from the Pi's own public/ directory, so the chart renders
// identically whether the boat has wifi or not.
//
// Two PMTiles sources feed it:
//   - `noaa`      — overlay data (depth contours, soundings, buoys, lights,
//                   wrecks, obstructions, coastline). Built by
//                   scripts/build-charts.sh.
//   - `noaa-base` — land polygons (LNDARE), built-up areas (BUAARE),
//                   shoreline structures (SLCONS), landmarks (LNDMRK).
//                   Built by scripts/build-base-charts.sh.
//
// Navaid symbol layers + sprite icons are still added at runtime
// (addNavaidSymbolLayers + useNavaidSpriteTheme) rather than baked into
// this style, because they depend on CSS-var palette tokens that can
// shift between day and night themes.
//
// If either PMTiles file is absent at load time the source creation
// throws silently — the map still renders with whatever IS available.

import type { StyleSpecification } from 'maplibre-gl';
import { pmtilesUrl } from './chartUrls';

const NOAA_OVERLAY_URL = pmtilesUrl('maine.pmtiles');
const NOAA_BASE_URL = pmtilesUrl('maine-base.pmtiles');

// Glyph URL template — {fontstack} is the font family name, {range} is the
// 256-char unicode block (e.g. "0-255", "256-511"). Served from public/fonts
// by the static file server, so a URL like
//   /fonts/Noto Sans Bold/0-255.pbf
// resolves to a real file on disk.
// BASE_URL-prefixed: the phone build is served from a subpath (/zissou/).
const GLYPHS_URL = `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`;

export function buildOfflineStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Marine offline',
    glyphs: GLYPHS_URL,
    sources: {
      noaa: {
        type: 'vector',
        url: NOAA_OVERLAY_URL,
        attribution: 'NOAA ENC',
      },
      'noaa-base': {
        type: 'vector',
        url: NOAA_BASE_URL,
        attribution: 'NOAA ENC',
      },
      // GNIS place-name points — plain GeoJSON, precached with the app.
      placenames: {
        type: 'geojson',
        data: `${import.meta.env.BASE_URL}labels/maine-places.json`,
        attribution: 'USGS GNIS',
      },
    },
    layers: [
      // Sand background — anywhere no polygon paints over it reads as land.
      // Chosen to match --surface-sand so the chart ties to the UI chrome.
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#F0EBE0' },
      },
      // Water fill from NOAA depth areas. DEPARE is a polygon layer where
      // every feature is a range of water depth; painting it a single
      // slate-blue gives us a solid water fill that also covers the ocean
      // at overview zooms where OpenFreeMap previously provided this.
      {
        id: 'water-depare',
        type: 'fill',
        source: 'noaa',
        'source-layer': 'depare',
        paint: {
          'fill-color': '#547A9E',
          'fill-antialias': true,
        },
      },
      // Land fill from NOAA land areas. LNDARE polygons sit on top of the
      // sand background only where they exist — so shore-edge detail reads
      // correctly: land is sand where LNDARE says so, water is slate where
      // DEPARE says so, and the background catches any gaps.
      {
        id: 'land-lndare',
        type: 'fill',
        source: 'noaa-base',
        'source-layer': 'lndare',
        paint: {
          'fill-color': '#F0EBE0',
          'fill-outline-color': '#142038',
        },
      },
      // Built-up areas (BUAARE) — harbor towns. Slightly warmer than bare
      // land so the operator can see Castine, Rockland, etc. without
      // street-level detail. Subtle, not dominant.
      {
        id: 'builtup-buaare',
        type: 'fill',
        source: 'noaa-base',
        'source-layer': 'buaare',
        minzoom: 10,
        paint: {
          'fill-color': '#E3D9BE',
          'fill-opacity': 0.7,
        },
      },
      // Coastline — the line where land meets water. Uses COALNE from the
      // overlay PMTiles (we already extract it; no rebuild needed).
      {
        id: 'coastline-coalne',
        type: 'line',
        source: 'noaa',
        'source-layer': 'coalne',
        paint: {
          'line-color': '#142038',
          'line-width': 1,
        },
      },
      // Shoreline structures — piers, breakwaters, sea walls. Thin navy
      // lines from SLCONS; only visible at approach zoom and higher so
      // overview stays clean.
      {
        id: 'shoreline-slcons',
        type: 'line',
        source: 'noaa-base',
        'source-layer': 'slcons',
        minzoom: 12,
        paint: {
          'line-color': '#142038',
          'line-width': 1.5,
        },
      },
      // Place names — GNIS (USGS) label POINTS from public/labels/
      // maine-places.json (built by scripts/build-place-labels.mjs; served
      // with the app and precached by the service worker). One point per
      // named place = no tile-split repeats, and it includes water names
      // (bays, channels — "Fox Islands Thorofare") that ENC land polygons
      // never had. Per-feature `mz` gates progressive disclosure: towns
      // z9, islands/bays/channels z10, harbors z11, capes z12.
      {
        id: 'label-places-water',
        type: 'symbol',
        source: 'placenames',
        filter: ['all', ['==', ['get', 'c'], 'water'], ['>=', ['zoom'], ['get', 'mz']]],
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 13],
          'text-letter-spacing': 0.18,
          'text-max-width': 9,
          'text-optional': true,
          'text-padding': 6,
          'symbol-sort-key': ['get', 'p'],
        },
        paint: {
          'text-color': '#142038',
          'text-halo-color': '#F0EBE0',
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'label-places-island',
        type: 'symbol',
        source: 'placenames',
        filter: ['all', ['==', ['get', 'c'], 'island'], ['>=', ['zoom'], ['get', 'mz']]],
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 14],
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
          'text-optional': true,
          'text-transform': 'uppercase',
          'text-padding': 6,
          'symbol-sort-key': ['get', 'p'],
        },
        paint: {
          'text-color': '#142038',
          'text-halo-color': '#F0EBE0',
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'label-places-town',
        type: 'symbol',
        source: 'placenames',
        filter: ['all', ['==', ['get', 'c'], 'town'], ['>=', ['zoom'], ['get', 'mz']]],
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 14],
          'text-letter-spacing': 0.04,
          'text-max-width': 8,
          'text-optional': true,
          'text-padding': 6,
          'symbol-sort-key': ['get', 'p'],
        },
        paint: {
          'text-color': '#142038',
          'text-halo-color': '#F0EBE0',
          'text-halo-width': 1.5,
        },
      },
      // Landmark labels — lighthouses, towers, conspicuous features. Text
      // from OBJNAM, navy on sand halo. minzoom 13 so they only show when
      // the chart has room for them.
      {
        id: 'landmark-lndmrk',
        type: 'symbol',
        source: 'noaa-base',
        'source-layer': 'lndmrk',
        minzoom: 13,
        filter: ['has', 'OBJNAM'],
        layout: {
          'text-field': ['get', 'OBJNAM'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
          'text-letter-spacing': 0.06,
          'text-max-width': 8,
          'text-optional': true,
        },
        paint: {
          'text-color': '#142038',
          'text-halo-color': '#F0EBE0',
          'text-halo-width': 1.5,
        },
      },
      // The remaining NOAA overlay layers (depth contours + labels,
      // soundings, buoys/beacons/lights/wrecks symbols) are added at
      // runtime by addNoaaChartLayers in marineStyle.ts. Keeping that
      // split so the CSS-var → color pipeline for depth coloring can
      // stay in code.
    ],
  };
}
