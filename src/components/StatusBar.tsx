import { useEffect, useState } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { formatCompassBearing, formatLat, formatLon, formatSpeedKnMph } from '../utils/formatters';

const STALE_MS = 30_000;

export type ViewMode = 'split' | 'ais' | 'chart';

interface StatusBarProps {
  activeView: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

export function StatusBar({ activeView, onViewChange }: StatusBarProps) {
  const self = useSelf();
  const now = useNow(1000);
  const hasFix = self?.position != null;
  const isStale = self ? now - self.lastUpdated > STALE_MS : true;

  const speed = self?.sog != null && self.sog >= 0 && self.sog < 60
    ? formatSpeedKnMph(self.sog)
    : '—';
  const headingValid =
    self?.cog != null && self.cog >= 0 && self.cog <= Math.PI * 2 && !isStale && hasFix;
  const headingText = headingValid ? formatCompassBearing(self!.cog!) : '—';

  return (
    <header className="statusbar">
      <div className="statusbar__left">
        <span className="statusbar__vessel">{self?.name ?? '—'}</span>
        <FixIndicator hasFix={hasFix} isStale={isStale} />
      </div>

      <div className="statusbar__metrics">
        <Metric label="Lat" value={formatLat(self?.position?.latitude)} mono />
        <Metric label="Lon" value={formatLon(self?.position?.longitude)} mono />
        <Metric label="Speed" value={speed} />
        <Metric
          label="Heading"
          value={
            <>
              <span>{headingText}</span>
              {headingValid && <HeadingGlyph cogRad={self!.cog!} />}
            </>
          }
        />
      </div>

      <nav className="statusbar__tabs" aria-label="View">
        <TabButton active={activeView === 'split'} onClick={() => onViewChange('split')}>Split</TabButton>
        <TabButton active={activeView === 'ais'} onClick={() => onViewChange('ais')}>AIS</TabButton>
        <TabButton active={activeView === 'chart'} onClick={() => onViewChange('chart')}>Chart</TabButton>
      </nav>
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
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ transform: `rotate(${deg}deg)` }}
      aria-hidden="true"
    >
      <path d="M 7 1 L 11.5 12.5 L 7 9.5 L 2.5 12.5 Z" fill="currentColor" />
    </svg>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
