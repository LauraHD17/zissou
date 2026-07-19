import { useRef, useState } from 'react';
import { isValidCogRad, isValidSogMs } from '../signalk/types';
import { useSelf } from '../signalk/useSignalK';
import { resolveBoatName, useUserPrefs } from '../prefs/userPrefsStore';
import { formatCompassBearing } from '../utils/bearings';
import { useNowMs } from '../utils/clock';
import { FALLBACK_POS } from '../utils/geometry';
import { formatLat, formatLon, formatSpeedKnMph } from '../utils/units';
import { HelpButton } from '../help/HelpButton';
import { ClockSunTide } from './ClockSunTide';
import { MOBButton } from './MOBButton';
import { SettingsButton } from './SettingsButton';
import { ThemeToggle } from './ThemeToggle';
import { WaypointsButton } from './WaypointsButton';

/** GPS fix considered stale if no update in this many ms. Distinct from
 *  AIS_STALE_MS (5 min) — own-fix tolerance is much tighter. */
const FIX_STALE_MS = 30_000;

export type ViewMode = 'split' | 'ais' | 'chart';

interface Props {
  activeView: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

export function StatusBar({ activeView, onViewChange }: Props) {
  const self = useSelf();
  const prefs = useUserPrefs();
  const now = useNowMs(1000);
  const hasFix = self?.position != null;
  const isStale = self ? now - self.lastUpdated > FIX_STALE_MS : true;
  // Collapsed = controls (tabs, buttons, MOB, nameplate) hidden; the clock/
  // tide and position/speed/heading lines always stay. Toggled by the
  // chevron or by swiping up/down on the bar — chart space is precious on a
  // phone, especially landscape. MOB stays reachable via expand or M-O-B.
  const [collapsed, setCollapsed] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current;
    touchStartY.current = null;
    const end = e.changedTouches[0]?.clientY;
    if (start == null || end == null) return;
    const delta = end - start;
    if (delta < -30) setCollapsed(true);
    if (delta > 30) setCollapsed(false);
  };

  const speed = isValidSogMs(self?.sog) ? formatSpeedKnMph(self.sog) : '—';
  const cogShown = !isStale && hasFix && isValidCogRad(self?.cog) ? self.cog : null;
  const headingText = cogShown != null ? formatCompassBearing(cogShown) : '—';
  const boatName = resolveBoatName(prefs.boatName, self?.name);

  return (
    <header className="statusbar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="statusbar__row statusbar__row--chrome">
        <div className="statusbar__left">
          <FixIndicator hasFix={hasFix} isStale={isStale} />
          <ClockSunTide pos={self?.position ?? FALLBACK_POS} />
        </div>

        <h1 className={`statusbar__nameplate${collapsed ? ' sr-only' : ''}`}>{boatName}</h1>

        <div className="statusbar__right">
          {!collapsed && (
            <>
              <nav className="statusbar__tabs" aria-label="View">
                <TabButton active={activeView === 'split'} onClick={() => onViewChange('split')}>
                  Split
                </TabButton>
                <TabButton active={activeView === 'ais'} onClick={() => onViewChange('ais')}>
                  AIS
                </TabButton>
                <TabButton active={activeView === 'chart'} onClick={() => onViewChange('chart')}>
                  Chart
                </TabButton>
              </nav>
              <WaypointsButton />
              <SettingsButton />
              <ThemeToggle />
              <MOBButton onViewChange={onViewChange} />
            </>
          )}
        </div>
      </div>

      <div className="statusbar__row statusbar__row--metrics">
        <Metric
          label="Position"
          mono
          value={
            <>
              {formatLat(self?.position?.latitude)}
              <span className="statusbar__metric-sep" aria-hidden="true">
                ·
              </span>
              {formatLon(self?.position?.longitude)}
            </>
          }
        />
        <Metric label="Speed" value={speed} />
        <Metric
          label="Heading"
          value={
            <>
              <span>{headingText}</span>
              {cogShown != null && <HeadingGlyph cogRad={cogShown} />}
            </>
          }
        />
        <HelpButton />
        <button
          type="button"
          className="statusbar__collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show controls' : 'Hide controls'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>
    </header>
  );
}

function FixIndicator({ hasFix, isStale }: { hasFix: boolean; isStale: boolean }) {
  const state = !hasFix ? 'no-fix' : isStale ? 'stale' : 'ok';
  const label = state === 'ok' ? 'GPS OK' : state === 'stale' ? 'GPS stale' : 'no fix';
  return <span className={`fix-indicator fix-indicator--${state}`}>{label}</span>;
}

function Metric({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <span className="statusbar__metric">
      <span className="statusbar__metric-label">{label}</span>
      <span className={`statusbar__metric-value${mono ? ' statusbar__metric-value--mono' : ''}`}>
        {value}
      </span>
    </span>
  );
}

function HeadingGlyph({ cogRad }: { cogRad: number }) {
  const deg = (cogRad * 180) / Math.PI;
  return (
    <svg
      className="heading-glyph"
      width="16"
      height="16"
      viewBox="0 0 14 14"
      style={{ transform: `rotate(${deg}deg)` }}
      aria-hidden="true"
    >
      <path d="M 7 1 L 11.5 12.5 L 7 9.5 L 2.5 12.5 Z" fill="currentColor" />
    </svg>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tab${active ? ' tab--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
