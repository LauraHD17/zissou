import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts — bundled via @fontsource so the app renders its
// correct typography without any network round-trip. Replaces the former
// Google Fonts CDN link in index.html.
import '@fontsource-variable/zalando-sans-expanded';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';

import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
