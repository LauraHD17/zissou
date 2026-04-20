// Day/night theme controller. Mode persists in localStorage; 'auto' tracks
// civil-twilight at the operator's current GPS position. The active theme is
// applied as a `data-theme` attribute on <html>, so all theming is CSS — no
// component branches.

import { useEffect } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { useNow } from '../utils/clock';
import { FALLBACK_POS } from '../utils/geometry';
import { defineStore } from '../storage/localStore';
import type { ThemePrefs } from '../types/nav';
import SunCalc from 'suncalc';

const themeStore = defineStore<ThemePrefs>('nav.theme.v1', 1, {
  mode: 'auto',
  brightnessPct: 40,
});

export function useThemePrefs() {
  return themeStore.use();
}

export function setThemeMode(mode: ThemePrefs['mode']) {
  themeStore.update((p) => ({ ...p, mode }));
}

export function setBrightness(brightnessPct: ThemePrefs['brightnessPct']) {
  themeStore.update((p) => ({ ...p, brightnessPct }));
}

/**
 * Apply the active theme (`day` | `night`) to <html>. Call once at the App
 * root. Re-evaluates on every minute tick when in 'auto' mode (cheap; suncalc
 * is < 1 ms). Resolves auto via civil twilight end (suncalc.dusk).
 */
export function useApplyTheme() {
  const prefs = useThemePrefs();
  const self = useSelf();
  const now = useNow(60_000);

  useEffect(() => {
    const pos = self?.position ?? FALLBACK_POS;
    const active = resolveActiveTheme(prefs.mode, now, pos);
    document.documentElement.dataset.theme = active;
    document.documentElement.style.setProperty(
      '--night-brightness',
      String(prefs.brightnessPct / 100),
    );
  }, [prefs.mode, prefs.brightnessPct, now, self?.position?.latitude, self?.position?.longitude]);
}

export function resolveActiveTheme(
  mode: ThemePrefs['mode'],
  now: Date,
  pos: { latitude: number; longitude: number },
): 'day' | 'night' {
  if (mode === 'day' || mode === 'night') return mode;
  // auto: night between civil dusk today and civil dawn tomorrow.
  const today = SunCalc.getTimes(now, pos.latitude, pos.longitude);
  const tomorrow = SunCalc.getTimes(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    pos.latitude,
    pos.longitude,
  );
  const dusk = today.dusk;
  const dawn = tomorrow.dawn ?? today.dawn;
  if (!(dusk instanceof Date) || isNaN(dusk.getTime())) return 'day';
  if (now < today.dawn) return 'night'; // before today's dawn = still in last night
  if (now >= dusk && now < dawn) return 'night';
  return 'day';
}
