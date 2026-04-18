import { useState } from 'react';
import { StatusBar, type ViewMode } from './components/StatusBar';
import { AISPage } from './pages/AISPage';
import { ChartPage } from './pages/ChartPage';
import './styles/app.css';

export function App() {
  const [view, setView] = useState<ViewMode>('split');

  return (
    <div className="app">
      <StatusBar activeView={view} onViewChange={setView} />
      <main className={`app__main app__main--${view}`}>
        <div className="ais-column">
          <AISPage compact={view === 'split'} />
        </div>
        <div className="chart-column">
          <ChartPage />
        </div>
      </main>
    </div>
  );
}
