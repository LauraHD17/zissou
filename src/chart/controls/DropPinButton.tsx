// Toggles drop-pin (destination) mode. When armed, a chart tap/drag drops a
// Go-To destination at the release point. The button's coordinate-entry
// alternative (long-press the button itself) is the WCAG 2.5.7 path for users
// who can't drag-tap on the chart.

import { useState } from 'react';
import { Icon } from '../../icons';
import { SlidePanel } from '../../ui/SlidePanel';
import { replaceRouteWithSingle } from '../../waypoints/routeStore';

interface Props {
  armed: boolean;
  onToggle: () => void;
}

const LONG_PRESS_MS = 600;

export function DropPinButton({ armed, onToggle }: Props) {
  const [coordPanelOpen, setCoordPanelOpen] = useState(false);
  const [pressTimer, setPressTimer] = useState<number | null>(null);

  const onPointerDown = () => {
    const t = window.setTimeout(() => {
      setCoordPanelOpen(true);
      setPressTimer(null);
    }, LONG_PRESS_MS);
    setPressTimer(t);
  };
  const onPointerUp = () => {
    if (pressTimer != null) {
      window.clearTimeout(pressTimer);
      setPressTimer(null);
      onToggle(); // short tap = toggle armed
    }
  };
  const onPointerCancel = () => {
    if (pressTimer != null) {
      window.clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`map-control-btn${armed ? ' map-control-btn--active' : ''}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-label={
          armed
            ? 'Drop-pin mode armed. Tap chart and hold to place a destination. Long-press this button for coordinate entry.'
            : 'Drop pin. Tap to arm, then tap-and-hold the chart to place a destination. Long-press this button for coordinate entry.'
        }
        aria-pressed={armed}
      >
        <Icon name="pin" size={24} />
      </button>

      {coordPanelOpen && (
        <SlidePanel open onClose={() => setCoordPanelOpen(false)} labelledBy="coord-entry-title">
          <CoordinateEntryForm onSubmit={() => setCoordPanelOpen(false)} />
        </SlidePanel>
      )}
    </>
  );
}

function CoordinateEntryForm({ onSubmit }: { onSubmit: () => void }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (!Number.isFinite(latN) || latN < -90 || latN > 90) {
      setErr('Latitude must be a number between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lonN) || lonN < -180 || lonN > 180) {
      setErr('Longitude must be a number between -180 and 180.');
      return;
    }
    replaceRouteWithSingle({
      source: 'goto-coords',
      position: { latitude: latN, longitude: lonN },
      label: `${latN.toFixed(4)}, ${lonN.toFixed(4)}`,
    });
    onSubmit();
  };

  return (
    <form onSubmit={submit} className="coord-entry">
      <h2 id="coord-entry-title" className="coord-entry__title">
        Enter destination coordinates
      </h2>
      <label className="coord-entry__field">
        <span>Latitude</span>
        <input
          type="text"
          inputMode="decimal"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="44.3950"
          autoFocus
        />
      </label>
      <label className="coord-entry__field">
        <span>Longitude</span>
        <input
          type="text"
          inputMode="decimal"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          placeholder="-68.7898"
        />
      </label>
      {err && (
        <p className="coord-entry__error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="coord-entry__submit">
        Set destination
      </button>
    </form>
  );
}
