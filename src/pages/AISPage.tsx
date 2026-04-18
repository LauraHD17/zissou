import { AISList } from '../components/AISList';
import { useSelf } from '../signalk/useSignalK';

export function AISPage() {
  const self = useSelf();
  return (
    <div className="page page--ais">
      <header className="page__header">
        <h1>AIS targets</h1>
        <div className="page__self">
          {self?.position
            ? `${self.position.latitude.toFixed(4)}, ${self.position.longitude.toFixed(4)}`
            : 'waiting for fix…'}
          {self?.sog != null && ` · ${self.sog.toFixed(1)} kn`}
          {self?.cog != null && ` · ${Math.round(self.cog)}°`}
        </div>
      </header>
      <AISList />
    </div>
  );
}
