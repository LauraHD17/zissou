// Anchor watch button (chart control stack). Tap behavior depends on state:
//   idle    → AnchorConfigPanel (radius picker + audio toggle + Drop)
//   active  → AnchorActivePanel (current radius + Clear)
// Active state visually inverts (sand fill, navy icon) to match the existing
// mode-toggle convention.

import { useState } from 'react';
import { Icon } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import {
  acknowledgeAnchorAlarm,
  clearAnchor,
  dropAnchor,
  useAnchorWatch,
} from './anchorStore';
import { useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition } from '../utils/geometry';
import type { AnchorRadiusFt } from '../types/nav';
import { useActiveAlarm } from '../alarm/alarmStore';

const RADII: AnchorRadiusFt[] = [50, 75, 100];

export function AnchorButton() {
  const anchor = useAnchorWatch();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`map-control-btn${anchor ? ' map-control-btn--active' : ''}`}
        onClick={() => setOpen(true)}
        aria-pressed={!!anchor}
        aria-label={anchor ? 'Anchor watch active. Tap to clear.' : 'Drop anchor watch.'}
      >
        <Icon name="anchor" size={24} />
      </button>

      {open && (
        <SlidePanel open onClose={() => setOpen(false)} labelledBy="anchor-panel-title">
          {anchor ? (
            <ActivePanel onClose={() => setOpen(false)} />
          ) : (
            <ConfigPanel onClose={() => setOpen(false)} />
          )}
        </SlidePanel>
      )}
    </>
  );
}

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const self = useSelf();
  const [radius, setRadius] = useState<AnchorRadiusFt>(75);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const canDrop = self?.position && isPlausiblePosition(self.position);

  return (
    <div className="anchor-panel">
      <h2 id="anchor-panel-title" className="anchor-panel__title">Drop anchor here</h2>
      <p className="anchor-panel__subtitle">
        Watches your position; alerts if you drift outside the circle.
      </p>

      <fieldset className="anchor-panel__radii">
        <legend>Watch radius</legend>
        <div className="anchor-panel__radii-grid">
          {RADII.map((r) => (
            <label
              key={r}
              className={`anchor-panel__radius${radius === r ? ' anchor-panel__radius--active' : ''}`}
            >
              <input
                type="radio"
                name="anchor-radius"
                checked={radius === r}
                onChange={() => setRadius(r)}
              />
              <span>{r} ft</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="anchor-panel__audio">
        <input
          type="checkbox"
          checked={audioEnabled}
          onChange={(e) => setAudioEnabled(e.target.checked)}
        />
        <span>Play audio alarm if dragging</span>
      </label>

      <button
        type="button"
        className="anchor-panel__drop"
        disabled={!canDrop}
        onClick={() => {
          if (!canDrop) return;
          dropAnchor({
            drop: self!.position!,
            radiusFt: radius,
            audioEnabled,
          });
          onClose();
        }}
      >
        {canDrop ? 'Drop anchor' : 'Waiting for GPS fix…'}
      </button>
    </div>
  );
}

function ActivePanel({ onClose }: { onClose: () => void }) {
  const anchor = useAnchorWatch();
  const alarm = useActiveAlarm();
  if (!anchor) return null;

  const isAlarming = alarm?.kind === 'anchor-drag' && !alarm.acknowledged;

  return (
    <div className="anchor-panel">
      <h2 id="anchor-panel-title" className="anchor-panel__title">Anchor watch active</h2>
      <p className="anchor-panel__subtitle">
        Watching {anchor.radiusFt} ft from drop point. {anchor.audioEnabled ? 'Audio on.' : 'Audio off.'}
      </p>
      {isAlarming && (
        <button
          type="button"
          className="action-sheet__btn"
          onClick={() => {
            acknowledgeAnchorAlarm();
            // Don't clear the alarm — only the visible flash. Operator
            // acknowledged but the condition still applies until the boat is
            // back inside the circle or the watch is cleared.
          }}
        >
          Acknowledge alarm
        </button>
      )}
      <button
        type="button"
        className="action-sheet__btn action-sheet__btn--danger"
        onClick={() => {
          clearAnchor();
          onClose();
        }}
      >
        Clear anchor watch
      </button>
    </div>
  );
}
