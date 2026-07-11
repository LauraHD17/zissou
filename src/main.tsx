import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts — bundled via @fontsource so the app renders its
// correct typography without any network round-trip. Replaces the former
// Google Fonts CDN link in index.html.
import '@fontsource-variable/zalando-sans-expanded';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';

import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { scheduleCrashReload } from './ui/crashReload';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

// Last-resort watchdog: if an error outside React's render path somehow left
// the app unmounted (empty root), restart the page. Errors that leave the UI
// standing are only logged — an unhandled fetch rejection must not reload a
// working chart at the helm.
window.addEventListener('error', () => {
  if (root.childElementCount === 0) scheduleCrashReload();
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
});

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
