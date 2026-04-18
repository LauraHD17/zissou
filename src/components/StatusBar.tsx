import { useEffect, useState } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { formatLat, formatLon, formatSpeedKnMph } from '../utils/formatters';

const STALE_MS = 30_000;

export type PageKey = 'ais' | 'chart';

interface StatusBarProps {
  activePage: PageKey;
  onPageChange: (page: PageKey) => void;
}

export function StatusBar({ activePage, onPageChange }: StatusBarProps) {
  const self = useSelf();
  const now = useNow(1000);
  const hasFix = self?.position != null;
  const isStale = self ? now - self.lastUpdated > STALE_MS : true;

  const speed = self?.sog != null && self.sog >= 0 && self.sog < 60
    ? formatSpeedKnMph(self.sog)
    : '—';
  const heading = self?.cog != null && self.cog >= 0 && self.cog <= Math.PI * 2
    ? `${Math.round((self.cog * 180) / Math.PI)}°`
    : '—';

  return (
    <div className="statusbar">
      <div className="statusbar__left">
        <span className="statusbar__vessel">{self?.name ?? '—'}</span>
        <FixIndicator hasFix={hasFix} isStale={isStale} />
      </div>

      <div className="statusbar__metrics">
        <Metric label="Lat" value={formatLat(self?.position?.latitude)} />
        <Metric label="Lon" value={formatLon(self?.position?.longitude)} />
        <Metric label="Speed" value={speed} />
        <Metric label="Heading" value={heading} />
      </div>

      <nav className="statusbar__tabs">
        <TabButton active={activePage === 'ais'} onClick={() => onPageChange('ais')}>AIS</TabButton>
        <TabButton active={activePage === 'chart'} onClick={() => onPageChange('chart')}>Chart</TabButton>
      </nav>
    </div>
  );
}

function FixIndicator({ hasFix, isStale }: { hasFix: boolean; isStale: boolean }) {
  const state = !hasFix ? 'no-fix' : isStale ? 'stale' : 'ok';
  const label = state === 'ok' ? 'GPS OK' : state === 'stale' ? 'GPS stale' : 'no fix';
  return <span className={`fix-indicator fix-indicator--${state}`}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="statusbar__metric">
      <span className="statusbar__metric-label">{label}</span>
      <span className="statusbar__metric-value">{value}</span>
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`tab${active ? ' tab--active' : ''}`} onClick={onClick}>
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
