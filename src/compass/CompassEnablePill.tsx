// One-tap compass permission for the phone build (iOS requires the request
// to come from a user gesture). Shows only in geo mode when the compass
// isn't live yet; disappears forever after a successful grant (subsequent
// launches re-arm silently via resumeCompassIfGranted).

import { useEffect, useState } from 'react';
import {
  compassSupported,
  enableCompass,
  resumeCompassIfGranted,
  useCompassGranted,
} from './compassStore';

const IS_PHONE_BUILD = import.meta.env.VITE_SIGNALK_MODE === 'geo';

export function CompassEnablePill() {
  const grantedBefore = useCompassGranted();
  const [dismissed, setDismissed] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!IS_PHONE_BUILD) return;
    void resumeCompassIfGranted().then(() => {
      // If a previous grant re-armed silently, never show the pill.
    });
  }, []);

  if (!IS_PHONE_BUILD || !compassSupported() || grantedBefore || dismissed || live) return null;

  const enable = async () => {
    const ok = await enableCompass();
    if (ok) setLive(true);
    else setDismissed(true); // denied — don't nag; COG-only still works
  };

  return (
    <div className="chart-download compass-pill" role="status">
      <button
        type="button"
        className="pill-dismiss"
        aria-label="Hide compass message"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
      <span className="chart-download__text">
        Turn on the compass so the boat arrow follows which way the phone points, even when you're
        not moving.
      </span>
      <button type="button" className="chart-download__button" onClick={enable}>
        Enable compass
      </button>
    </div>
  );
}
