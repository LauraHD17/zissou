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
      // Island / land names — ENC land areas carry OBJNAM where NOAA named
      // them (islands, ledges, points). These are how a mariner orients,
      // so they show from overview zoom.
      {
        id: 'label-lndare',
        type: 'symbol',
        source: 'noaa-base',
        'source-layer': 'lndare',
        minzoom: 8,
        filter: ['has', 'OBJNAM'],
        layout: {
          'text-field': ['get', 'OBJNAM'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
          'text-optional': true,
          'text-transform': 'uppercase',
        },
        paint: {
          'text-color': '#142038',
          'text-halo-color': '#F0EBE0',
          'text-halo-width': 1.5,
        },
      },
      // Town / settlement names from built-up areas.
      {
        id: 'label-buaare',
        type: 'symbol',
        source: 'noaa-base',
        'source-layer': 'buaare',
        minzoom: 10,
        filter: ['has', 'OBJNAM'],
        layout: {
          'text-field': ['get', 'OBJNAM'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-letter-spacing': 0.04,
          'text-max-width': 8,
          'text-optional': true,
          // Wide collision padding: town polygons arrive split across tile
          // features, which would otherwise print the name twice side by side.
          'text-padding': 32,
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
