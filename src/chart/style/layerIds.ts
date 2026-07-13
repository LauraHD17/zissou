// Single source of truth for the runtime MapLibre layer IDs this app adds.
//
// Two hooks consume this: useNavaidTaps (click → detail panel) and
// useChartLayerVisibility (Layers panel toggles). Keeping the IDs here —
// grouped by ChartLayerPrefs key — means you can't add a new navaid layer
// in marineStyle.ts without also wiring it into both the tap path and the
// visibility path at the same time. The ts-const + keyof ChartLayerPrefs
// typing catches drift at compile time.
//
// The `tappable` export is the flat list of layer IDs that open the
// NavaidDetailPanel on click — derived from the groups that represent
// interactive chart features (i.e. every group except nothing right now,
// but keeping the derivation explicit so a future "static-only" group
// can opt out without editing the tap hook).

import type { ChartLayerPrefs } from '../../types/nav';

export const NOAA_LAYER_GROUPS: Record<keyof ChartLayerPrefs, readonly string[]> = {
  contours: ['noaa-depth-contour'],
  soundings: ['noaa-soundg-label'],
  // Not a NOAA layer — the runtime own-track line (TrackLine.ts). Lives in
  // this map so the Layers panel toggle drives it through the same
  // visibility hook; it is NOT in NAVAID_TAPPABLE_LAYER_IDS.
  track: ['own-track-line'],
  navaids: [
    'noaa-boylat-symbol',
    'noaa-boysaw-symbol',
    'noaa-boycar-symbol',
    'noaa-boyisd-symbol',
    'noaa-boyspp-symbol',
    'noaa-bcnlat-symbol',
    'noaa-bcnsaw-symbol',
    'noaa-bcncar-symbol',
    'noaa-bcnisd-symbol',
  ],
  lights: ['noaa-lights-symbol'],
  hazards: ['noaa-wrecks-symbol', 'noaa-obstrn-symbol'],
} as const;

// Every layer whose features should open the NavaidDetailPanel on tap.
// Currently all NOAA symbol/label layers are tappable.
export const NAVAID_TAPPABLE_LAYER_IDS: readonly string[] = [
  ...NOAA_LAYER_GROUPS.navaids,
  ...NOAA_LAYER_GROUPS.lights,
  ...NOAA_LAYER_GROUPS.hazards,
  ...NOAA_LAYER_GROUPS.soundings,
];
