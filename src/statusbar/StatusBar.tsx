import { isValidCogRad, isValidSogMs } from '../signalk/types';
import { useSelf } from '../signalk/useSignalK';
import { resolveBoatName, useUserPrefs } from '../prefs/userPrefsStore';
import { formatCompassBearing } from '../utils/bearings';
import { useNowMs } from '../utils/clock';
import { formatLat, formatLon, formatSpeedKnMph } from '../utils/units';
import { ClockSunTide } from './ClockSunTide';
import { MOBButton } from './MOBButton';
import { SettingsButton } from './SettingsButton';
import { ThemeToggle } from './ThemeToggle';
import { WaypointsButton } from './WaypointsButton';

/** GPS fix considered stale if no update in this many ms. Distinct from
 *  AIS_STALE_MS (5 min) — own-fix tolerance is much tighter. */
const FIX_STALE_MS = 30_000;

// Mid-coast Maine fallback so sun/tide compute before the GPS gets a fix.
const FALLBACK_POS = { latitude: 44.4, longitude: -68.8 };

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

  const speed = isValidSogMs(self?.sog) ? formatSpeedKnMph(self.sog) : '—';
  const cogShown = !isStale && hasFix && isValidCogRad(self?.cog) ? self.cog : null;
  const headingText = cogShown != null ? formatCompassBearing(cogShown) : '—';
  const boatName = resolveBoatName(prefs.boatName, self?.name);

  return (
    <header className="statusbar">
      <div className="statusbar__row statusbar__row--chrome">
        <div className="statusbar__left">
          <FixIndicator hasFix={hasFix} isStale={isStale} />
          <ClockSunTide pos={self?.position ?? FALLBACK_POS} />
        </div>

        <h1 className="statusbar__nameplate">{boatName}</h1>

        <div className="statusbar__right">
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
