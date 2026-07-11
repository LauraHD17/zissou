// One-time "save charts for offline" step for the phone/PWA build.
//
// Shows only in geo mode (the phone build) when the charts aren't fully
// cached yet. Charts are served same-origin by GitHub Pages — release
// assets can't be fetched by browsers (no CORS headers), so the deploy
// workflow copies them into the site. On the Pi (real mode) the files sit
// on local disk and this never appears.

import { useEffect, useState } from 'react';
import { chartsCached, chartsTotalBytes, downloadCharts } from './chartCache';

type Phase = 'checking' | 'idle' | 'downloading' | 'done' | 'error' | 'hidden';

const IS_PHONE_BUILD = import.meta.env.VITE_SIGNALK_MODE === 'geo';

export function ChartDownloadPill() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [fraction, setFraction] = useState<number | null>(null);
  const [totalMb, setTotalMb] = useState<number | null>(null);

  useEffect(() => {
    if (!IS_PHONE_BUILD || typeof caches === 'undefined') {
      setPhase('hidden');
      return;
    }
    let cancelled = false;
    void (async () => {
      const cached = await chartsCached();
      if (cancelled) return;
      if (cached) {
        setPhase('hidden');
        return;
      }
      setPhase('idle');
      const bytes = await chartsTotalBytes();
      if (!cancelled && bytes) setTotalMb(Math.round(bytes / 1_000_000));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'hidden' || phase === 'checking') return null;

  const start = async () => {
    setPhase('downloading');
    try {
      const ok = await downloadCharts((p) => setFraction(p.fraction));
      setPhase(ok ? 'done' : 'error');
    } catch {
      setPhase('error');
    }
  };

  return (
    <div className="chart-download" role="status">
      {phase === 'idle' && (
        <>
          <span className="chart-download__text">
            Save the charts on this device so they work with no signal.
          </span>
          <button type="button" className="chart-download__button" onClick={start}>
            Download charts{totalMb ? ` (${totalMb} MB)` : ''}
          </button>
        </>
      )}
      {phase === 'downloading' && (
        <span className="chart-download__text" aria-live="polite">
          Downloading charts…{fraction != null ? ` ${Math.round(fraction * 100)}%` : ''} — keep this
          screen open
        </span>
      )}
      {phase === 'done' && (
        <span className="chart-download__text" aria-live="polite">
          Charts saved — this device now works fully offline.
        </span>
      )}
      {phase === 'error' && (
        <>
          <span className="chart-download__text">
            Could not save the charts. Check free space (about 1 GB) and the connection.
          </span>
          <button type="button" className="chart-download__button" onClick={start}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
