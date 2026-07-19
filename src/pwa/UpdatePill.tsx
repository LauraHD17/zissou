// "Update ready" banner. With the SW in 'prompt' mode (vite.config.ts), a new
// app version downloads in the background and then WAITS — nothing reloads on
// its own. This pill tells the operator an update is staged; tapping it
// applies the update (one reload, at a moment of their choosing). Ignoring it
// is fine: the update also applies on the next cold start of the app.
//
// The dynamic import keeps the virtual module out of unit-test module graphs.

import { useEffect, useState } from 'react';

export function UpdatePill() {
  const [ready, setReady] = useState(false);
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            if (!mounted) return;
            setApply(() => () => void updateSW(true));
            setReady(true);
          },
        });
      })
      .catch(() => {
        // Virtual module unavailable (tests, dev without PWA) — no pill.
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) return null;

  return (
    <button type="button" className="update-pill" onClick={() => apply?.()}>
      App update ready — tap to restart and apply
    </button>
  );
}
