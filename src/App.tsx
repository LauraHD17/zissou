import { lazy, Suspense, useState } from 'react';
import { StatusBar, type ViewMode } from './statusbar/StatusBar';
import { AISPage } from './pages/AISPage';
import { useApplyTheme } from './theme/useTheme';
import { useAudioPriming } from './alarm/useAlarmAudio';
import { AlarmBanner } from './ui/AlarmBanner';
import './styles/app.css';
import './theme/night.css';

// MapLibre + pmtiles are heavy (~1 MB gzipped). Code-split so AIS-only mode
// doesn't pay for the chart on initial paint.
const ChartPage = lazy(() => import('./pages/ChartPage'));

export function App() {
  const [view, setView] = useState<ViewMode>('split');
  useApplyTheme();
  useAudioPriming();

  return (
    <div className="app">
      <AlarmBanner />
      <StatusBar activeView={view} onViewChange={setView} />
      <main className={`app__main app__main--${view}`}>
        <div className="ais-column">
          <AISPage compact={view === 'split'} />
        </div>
        <div className="chart-column">
          <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
            <ChartPage />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
