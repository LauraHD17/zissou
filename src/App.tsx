import { lazy, Suspense, useState } from 'react';
import { StatusBar, type ViewMode } from './statusbar/StatusBar';
import { AISPage } from './pages/AISPage';
import { useApplyTheme } from './theme/useTheme';
import { useAudioPriming } from './alarm/useAlarmAudio';
import { useBreadcrumbRecorder } from './breadcrumbs/useBreadcrumbRecorder';
import { useCruisingSpeedRecorder } from './prefs/useCruisingSpeedRecorder';
import { useAnchorageDryingAlert } from './safety/useAnchorageDryingAlert';
import { useWeatherAutoFetch } from './weather/useWeatherAutoFetch';
import { useTideRefresh } from './utils/useTideRefresh';
import { AlarmBanner } from './ui/AlarmBanner';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ChartDownloadPill } from './pwa/ChartDownloadPill';
import './styles/app.css';
import './theme/night.css';

// MapLibre + pmtiles are heavy (~1 MB gzipped). Code-split so AIS-only mode
// doesn't pay for the chart on initial paint.
const ChartPage = lazy(() => import('./pages/ChartPage'));

export function App() {
  const [view, setView] = useState<ViewMode>('split');
  useApplyTheme();
  useAudioPriming();
  useBreadcrumbRecorder();
  useCruisingSpeedRecorder();
  useAnchorageDryingAlert();
  useWeatherAutoFetch();
  useTideRefresh();

  return (
    <div className="app">
      <AlarmBanner />
      <ChartDownloadPill />
      <StatusBar activeView={view} onViewChange={setView} />
      <main className={`app__main app__main--${view}`}>
        <div className="ais-column">
          <AISPage compact={view === 'split'} />
        </div>
        <div className="chart-column">
          {/* Chart-local boundary: a chart crash degrades to "reload chart"
              while the AIS list and StatusBar keep working. */}
          <ErrorBoundary
            fallback={(retry) => (
              <div className="crash-panel crash-panel--chart" role="alert">
                <p className="crash-panel__body">The chart stopped working.</p>
                <button className="crash-panel__button" onClick={retry}>
                  Reload chart
                </button>
              </div>
            )}
          >
            <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
              <ChartPage />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
