// Day/night/auto picker. Button shows the currently-active resolved theme
// (sun = day, moon = night). Tap opens a SlidePanel with three radio choices.

import { useState } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { useNow } from '../utils/clock';
import { Icon } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import { resolveActiveTheme, setThemeMode, useThemePrefs } from '../theme/useTheme';
import type { ThemeMode } from '../types/nav';

const FALLBACK_POS = { latitude: 44.4, longitude: -68.8 };

const MODES: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Day during daylight, night after civil dusk.' },
  { value: 'day', label: 'Day', description: 'Force the navy + sand palette.' },
  {
    value: 'night',
    label: 'Night',
    description: 'Red-spectrum palette to preserve dark adaptation.',
  },
];

export function ThemeToggle() {
  const prefs = useThemePrefs();
  const self = useSelf();
  const now = useNow(60_000);
  const [open, setOpen] = useState(false);

  const active = resolveActiveTheme(prefs.mode, now, self?.position ?? FALLBACK_POS);
  const iconName = active === 'night' ? 'moon' : 'sun';

  return (
    <>
      <button
        type="button"
        className="statusbar__theme-toggle"
        onClick={() => setOpen(true)}
        aria-label={`Display mode: ${prefs.mode}. Tap to change.`}
      >
        <Icon name={iconName} size={20} />
      </button>

      {open && (
        <SlidePanel open onClose={() => setOpen(false)} labelledBy="theme-toggle-title">
          <h2 id="theme-toggle-title" className="theme-panel__title">
            Display mode
          </h2>
          <div className="theme-panel__choices" role="radiogroup">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`theme-panel__choice${prefs.mode === m.value ? ' theme-panel__choice--active' : ''}`}
              >
                <input
                  type="radio"
                  name="theme-mode"
                  value={m.value}
                  checked={prefs.mode === m.value}
                  onChange={() => {
                    setThemeMode(m.value);
                    setOpen(false);
                  }}
                />
                <span className="theme-panel__choice-label">{m.label}</span>
                <span className="theme-panel__choice-desc">{m.description}</span>
              </label>
            ))}
          </div>
        </SlidePanel>
      )}
    </>
  );
}
