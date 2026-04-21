// Shared type shapes for navigation features (waypoints, destination, anchor
// watch, MOB, theme, user prefs). Imported by stores and UI alike so the
// data model is one source of truth.

import type { Position } from '../signalk/types';

// ── Waypoints ──────────────────────────────────────────────────────────

export type WaypointCategory = 'mooring' | 'anchorage' | 'hazard' | 'poi';

export interface SavedWaypoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  category: WaypointCategory;
  notes?: string;
  createdAt: number;
}

// ── Active Route (Go-To + multi-pin) ───────────────────────────────────

export type RouteSource = 'drop-pin' | 'goto-coords' | 'saved' | 'recent' | 'mob';

/** A single waypoint in an active route. First waypoint is the closest leg
 *  from own-ship; last waypoint is the destination. */
export interface RouteWaypoint {
  id: string;
  position: Position;
  /** Optional label — set for saved waypoints and recents, blank for
   *  drop-pin waypoints. The destination widget uses it when present. */
  label?: string;
  /** Saved-waypoint id when the waypoint came from the saved set; lets us
   *  reflect "this saved waypoint is currently routed to" in the UI. */
  savedId?: string;
  setAt: number;
}

export interface ActiveRoute {
  /** Ordered; `waypoints[waypoints.length - 1]` is the destination. A single
   *  element represents today's legacy single-pin Go-To. */
  waypoints: RouteWaypoint[];
  /** Provenance of the first waypoint. Subsequent appends don't change it. */
  source: RouteSource;
  createdAt: number;
}

export interface RecentDestination {
  position: Position;
  label?: string;
  setAt: number;
}

// ── Anchor watch ───────────────────────────────────────────────────────

export type AnchorRadiusFt = 50 | 75 | 100;

export interface AnchorWatch {
  drop: Position;
  radiusFt: AnchorRadiusFt;
  /** Optional charted depth at the drop point (ft, at MLW). When set, enables
   *  the "anchorage drying" warning — computed against tide height forecast
   *  vs vessel draft + safety margin. */
  chartedDepthFt?: number;
  setAt: number;
  alarmAcknowledged: boolean;
  audioEnabled: boolean;
}

// ── Theme + user prefs ─────────────────────────────────────────────────

export type ThemeMode = 'day' | 'night' | 'auto';
export type BrightnessPct = 30 | 40 | 50;

export interface ThemePrefs {
  mode: ThemeMode;
  brightnessPct: BrightnessPct;
}

export type AlarmTone = 'siren' | 'chirp' | 'silent';

/** Label-priority mode for the chart. Controls which layer wins when place
 *  names and NOAA depth labels would overlap. */
export type ChartLabelPriority = 'balanced' | 'place' | 'depth';

/** Visibility toggles for NOAA chart data groups. Lets the operator hide
 *  detail they don't want on screen (e.g. turn soundings off in crowded
 *  harbors). Personal state — saved waypoints, own-ship, AIS targets —
 *  is NOT toggled here; those stay visible since they're session context,
 *  not chart content. */
export interface ChartLayerPrefs {
  contours: boolean;
  soundings: boolean;
  navaids: boolean;
  lights: boolean;
  hazards: boolean;
}

/** Hull dimensions, in feet. All optional — a partial spec still informs the
 *  calcs that use whatever fields are set. For a centerboard boat, draft is
 *  the board-down maximum (the shallow-water floor). */
export interface VesselDims {
  loaFt?: number;
  beamFt?: number;
  draftFt?: number;
}

/** Cruise prefs feed Safe Return ETAs and tide-aware passage windows.
 *  Cruising speed is auto-detected from GPS samples (see
 *  src/prefs/cruisingSpeedStore.ts); the optional override here takes
 *  precedence when the operator wants a specific value. */
export interface PropulsionPrefs {
  /** Manual override of the auto-detected cruising speed. Leave undefined to
   *  use the detected median. */
  cruisingSpeedKn?: number;
}

/** Home port / mooring for Safe Return calcs. Set once from Settings; used
 *  by the daylight-to-home countdown. */
export interface HomeMooring {
  latitude: number;
  longitude: number;
  /** Optional label — shown in the Safe Return pill ("2.3 hr to Camden"). */
  label?: string;
}

/** Soft limits for weather "can I go" assessments. */
export interface WeatherLimits {
  maxWindKn?: number;
  maxWaveFt?: number;
}

export interface UserPrefs {
  /** Operator-set display name for the vessel. Shown as the StatusBar
   *  nameplate; overrides the SignalK-reported self.name when set. */
  boatName: string;
  /** Hull dimensions — feeds shallow-water alarms and anchor scope calcs. */
  vessel: VesselDims;
  /** Safety cushion added to draft for tide-aware alerts, in feet. */
  safetyMarginFt: number;
  /** Fuel + cruise settings for the range circle + ETA refinement. */
  propulsion: PropulsionPrefs;
  /** Home port / mooring for Safe Return and "time to home" calcs. */
  homeMooring?: HomeMooring;
  /** Limits for "can I go" weather checks. */
  weatherLimits: WeatherLimits;
  alarmVolumePct: number; // 0–100
  alarmTone: AlarmTone;
  /** Which label layer wins when place names and depth labels overlap on the
   *  chart. Defaults to 'balanced' — place names at overview zoom, depth labels
   *  at approach zoom. */
  chartLabelPriority: ChartLabelPriority;
  /** Per-group visibility for NOAA chart data. All default to true; toggled
   *  from the Layers panel when the operator wants a cleaner view. */
  chartLayers: ChartLayerPrefs;
}
