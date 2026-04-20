// Chart-overlay pill: daylight remaining + ETA home + latest safe-departure
// clock. Hidden until the operator has set a home mooring in Settings.

import { formatLocalTime } from '../utils/clock';
import { useSafeReturn } from './useSafeReturn';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { OverlayPill } from '../ui/OverlayPill';

export function SafeReturnPill() {
  const prefs = useUserPrefs();
  const state = useSafeReturn();
  if (!prefs.homeMooring) return null;

  const label = prefs.homeMooring.label ?? 'home';
  const daylight = formatHoursMins(state.daylightHoursLeft * 60);
  const dismissKey = `safe-return:${prefs.homeMooring.latitude.toFixed(4)}:${prefs.homeMooring.longitude.toFixed(4)}`;

  if (state.etaHomeMins == null || state.marginMins == null || state.latestDepartureBy == null) {
    return (
      <OverlayPill
        className="safe-return safe-return--neutral"
        dismissKey={dismissKey}
        dismissLabel="Hide safe return"
        ariaLabel={`${daylight} of daylight left`}
      >
        <span className="safe-return__primary">{daylight} daylight</span>
        <span className="safe-return__meta">Waiting for GPS fix to compute {label} ETA</span>
      </OverlayPill>
    );
  }

  const warn = state.marginMins < 15;
  const eta = formatHoursMins(state.etaHomeMins);
  const departBy = formatLocalTime(state.latestDepartureBy);

  return (
    <OverlayPill
      className={`safe-return${warn ? ' safe-return--warn' : ''}`}
      dismissKey={dismissKey}
      dismissLabel="Hide safe return"
      ariaLabel={
        warn
          ? `Return window tight. ${daylight} of daylight, ${eta} to ${label}. Depart by ${departBy}.`
          : `${daylight} of daylight, ${eta} to ${label}. Depart by ${departBy}.`
      }
    >
      <span className="safe-return__primary">
        {daylight} daylight · {eta} to {label}
      </span>
      <span className="safe-return__meta">
        {warn ? 'Leave now — ' : 'Depart by '}
        {departBy}
      </span>
    </OverlayPill>
  );
}

function formatHoursMins(mins: number): string {
  if (!Number.isFinite(mins)) return '—';
  if (mins < 0) return '0 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
