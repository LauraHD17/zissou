import { useState } from 'react';
import { StatusBar, type PageKey } from './components/StatusBar';
import { AISPage } from './pages/AISPage';
import { ChartPage } from './pages/ChartPage';
import './styles/app.css';

export function App() {
  const [page, setPage] = useState<PageKey>('ais');

  return (
    <div className="app">
      <StatusBar activePage={page} onPageChange={setPage} />
      <main className="app__main">
        {page === 'ais' && <AISPage />}
        {page === 'chart' && <ChartPage />}
      </main>
    </div>
  );
}
