// User-editable preferences (identity, alarm prefs). Persisted.
//
// Separate from ThemePrefs (nav.theme.v1) so each concern has its own key —
// corruption of one doesn't wipe the other. See plan §localStorage schema.
//
// Scaffolded with boatName first; alarm volume / tone wire up when the
// Settings panel grows.

import { defineStore } from '../storage/localStore';
import type {
  HomeMooring,
  PropulsionPrefs,
  UserPrefs,
  VesselDims,
  WeatherLimits,
} from '../types/nav';

const DEFAULT_SAFETY_MARGIN_FT = 2;

const INITIAL: UserPrefs = {
  boatName: '',
  vessel: {},
  safetyMarginFt: DEFAULT_SAFETY_MARGIN_FT,
  propulsion: {},
  weatherLimits: {},
  alarmVolumePct: 80,
  alarmTone: 'siren',
};

const store = defineStore<UserPrefs>('nav.userPrefs.v1', 1, INITIAL);

// Back-fill fields added after v1 shipped so existing users keep prior data
// instead of resetting. Idempotent — runs once at module import, no-op on
// fresh installs. Add new checks here as fields grow.
(() => {
  const loaded = store.read() as Partial<UserPrefs>;
  const needsMigrate =
    loaded.safetyMarginFt == null || loaded.propulsion == null || loaded.weatherLimits == null;
  if (needsMigrate) {
    store.set({
      ...INITIAL,
      ...loaded,
      propulsion: { cruisingSpeedKn: loaded.propulsion?.cruisingSpeedKn },
      weatherLimits: { ...(loaded.weatherLimits ?? {}) },
    } as UserPrefs);
  }
})();

export function useUserPrefs() {
  return store.use();
}

export function readUserPrefs(): UserPrefs {
  return store.read();
}

export function setBoatName(name: string) {
  store.update((p) => ({ ...p, boatName: name.trim() }));
}

export function setVesselDims(dims: VesselDims) {
  store.update((p) => ({ ...p, vessel: dims }));
}

export function setSafetyMargin(ft: number) {
  store.update((p) => ({
    ...p,
    safetyMarginFt: Number.isFinite(ft) && ft >= 0 ? ft : p.safetyMarginFt,
  }));
}

export function setPropulsion(patch: Partial<PropulsionPrefs>) {
  store.update((p) => ({ ...p, propulsion: { ...p.propulsion, ...patch } }));
}

export function setHomeMooring(home: HomeMooring | undefined) {
  store.update((p) => ({ ...p, homeMooring: home }));
}

export function setWeatherLimits(patch: Partial<WeatherLimits>) {
  store.update((p) => ({ ...p, weatherLimits: { ...p.weatherLimits, ...patch } }));
}

/** Resolved display name: user-set boat name > SignalK self.name > "—". */
export function resolveBoatName(userBoatName: string, signalkName: string | undefined): string {
  if (userBoatName) return userBoatName;
  if (signalkName) return signalkName;
  return '—';
}
