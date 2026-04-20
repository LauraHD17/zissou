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

// ── Destination (active Go-To) ─────────────────────────────────────────

export type DestinationSource = 'goto-pin' | 'goto-coords' | 'saved' | 'recent' | 'mob';

export interface Destination {
  source: DestinationSource;
  /** Set when source === 'saved'; lets us track which waypoint is active. */
  savedId?: string;
  position: Position;
  label?: string;
  setAt: number;
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

export interface UserPrefs {
  theme: ThemePrefs;
  alarmVolumePct: number; // 0–100
  alarmTone: AlarmTone;
}
