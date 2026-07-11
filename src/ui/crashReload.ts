// Loop-guarded page reload for crash recovery. Separate module from
// ErrorBoundary so the component file exports only components (react-refresh).

const RELOAD_GUARD_KEY = 'nav.crashReloads.v1';
const RELOAD_WINDOW_MS = 60_000;
const MAX_RELOADS_PER_WINDOW = 2;
const RELOAD_DELAY_MS = 5_000;

function recentReloads(): number[] {
  try {
    const raw = sessionStorage.getItem(RELOAD_GUARD_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    const cutoff = Date.now() - RELOAD_WINDOW_MS;
    return arr.filter((t): t is number => typeof t === 'number' && t > cutoff);
  } catch {
    return [];
  }
}

/**
 * Schedules a page reload in a few seconds unless the loop guard has already
 * spent its budget (2 reloads per minute). Returns whether a reload is coming.
 */
export function scheduleCrashReload(): boolean {
  const recent = recentReloads();
  if (recent.length >= MAX_RELOADS_PER_WINDOW) return false;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify([...recent, Date.now()]));
  } catch {
    // Storage unavailable — reload anyway; the guard is best-effort.
  }
  window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
  return true;
}
