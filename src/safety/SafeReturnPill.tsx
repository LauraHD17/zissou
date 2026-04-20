// Chart-overlay pill showing daylight remaining + recommended departure.
// Positioned below the DestinationWidget so both read in a row. Hidden
// until the operator has set a home mooring in Settings (otherwise it's
// meaningless).
//
// Colors:
//   amber border normally
//   red border when the boat is outside its safe-return window (margin < 0
//   or margin < 15 min)

import { formatLocalTime } from '../utils/clock';
import { useSafeReturn } from './useSafeReturn';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { dismiss, useIsDismissed } from '../ui/dismissStore';
import { DismissButton } from '../ui/DismissButton';

export function SafeReturnPill() {
  const prefs = useUserPrefs();
  const state = useSafeReturn();
  // Dismissal resets when home mooring changes (different context).
  const dismissKey = prefs.homeMooring
    ? `safe-return:${prefs.homeMooring.latitude.toFixed(4)}:${prefs.homeMooring.longitude.toFixed(4)}`
    : 'safe-return:none';
  const dismissed = useIsDismissed(dismissKey);

  if (!prefs.homeMooring || dismissed) return null;

  const label = prefs.homeMooring.label ?? 'home';
  const daylight = formatHoursMins(state.daylightHoursLeft * 60);

  if (state.etaHomeMins == null || state.marginMins == null || state.latestDepartureBy == null) {
    // No GPS fix yet — just show daylight remaining, no ETA.
    return (
      <div className="safe-return safe-return--neutral" aria-label={`${daylight} of daylight left`}>
        <DismissButton onClick={() => dismiss(dismissKey)} label="Hide safe return" />
        <span className="safe-return__primary">{daylight} daylight</span>
        <span className="safe-return__meta">Waiting for GPS fix to compute {label} ETA</span>
      </div>
    );
  }

  const warn = state.marginMins < 15;
  const eta = formatHoursMins(state.etaHomeMins);

  return (
    <div
      className={`safe-return${warn ? ' safe-return--warn' : ''}`}
      aria-label={
        warn
          ? `Return window tight. ${daylight} of daylight, ${eta} to ${label}. Depart by ${formatLocalTime(state.latestDepartureBy)}.`
          : `${daylight} of daylight, ${eta} to ${label}. Depart by ${formatLocalTime(state.latestDepartureBy)}.`
      }
    >
      <DismissButton onClick={() => dismiss(dismissKey)} label="Hide safe return" />
      <span className="safe-return__primary">
        {daylight} daylight · {eta} to {label}
      </span>
      <span className="safe-return__meta">
        {warn ? 'Leave now — ' : 'Depart by '}
        {formatLocalTime(state.latestDepartureBy)}
      </span>
    </div>
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
