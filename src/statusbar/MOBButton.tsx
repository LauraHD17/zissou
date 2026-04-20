// Always-visible MOB trigger in the StatusBar. Two-tap confirm via SlidePanel
// (deliberate; can't be triggered by accidental brush). Activation:
//   1. Drops a Destination at current position with source='mob'
//   2. Activates the MOB session (chart marker, audio chirp loop)
//   3. Auto-switches view to chart so marker + bearing widget are visible
//   4. Plays sharp confirm tone
// Active state: button text becomes "MOB ACTIVE — clear", tap to clear.
//
// Keyboard alternative for WCAG 2.5.7: M-O-B sequence within 2 s opens the
// confirm panel.

import { useEffect, useState } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition } from '../utils/geometry';
import { SlidePanel } from '../ui/SlidePanel';
import { activateMOB, clearMOB, useMOB } from '../mob/mobStore';
import { setDestination, clearDestination, readDestination } from '../waypoints/destinationStore';
import { playMobConfirmTone, playMobActivePulse } from '../alarm/useAlarmAudio';
import type { ViewMode } from './StatusBar';

interface Props {
  onViewChange: (v: ViewMode) => void;
}

const MOB_PULSE_INTERVAL_MS = 4000;
const KEYBOARD_SEQUENCE = ['m', 'o', 'b'] as const;
const KEYBOARD_TIMEOUT_MS = 2000;

export function MOBButton({ onViewChange }: Props) {
  const mob = useMOB();
  const self = useSelf();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Keyboard alternative: M, O, B in sequence within 2 s.
  useEffect(() => {
    let buf: string[] = [];
    let timer: number | null = null;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k !== KEYBOARD_SEQUENCE[buf.length]) {
        buf = k === KEYBOARD_SEQUENCE[0] ? [k] : [];
      } else {
        buf.push(k);
      }
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        buf = [];
      }, KEYBOARD_TIMEOUT_MS);
      if (buf.length === KEYBOARD_SEQUENCE.length) {
        buf = [];
        if (timer != null) window.clearTimeout(timer);
        setConfirmOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  // While MOB active: pulse a quiet chirp every 4 s so the operator knows
  // the system is still in MOB mode even when not looking at the screen.
  useEffect(() => {
    if (!mob) return;
    const id = window.setInterval(() => playMobActivePulse(), MOB_PULSE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [mob]);

  const canActivate = self?.position && isPlausiblePosition(self.position);

  const onConfirm = () => {
    if (!canActivate) return;
    const pos = self!.position!;
    activateMOB(pos);
    setDestination({
      source: 'mob',
      position: pos,
      label: 'MOB',
      setAt: Date.now(),
    });
    playMobConfirmTone();
    onViewChange('chart');
    setConfirmOpen(false);
  };

  const onClear = () => {
    clearMOB();
    // Clear the destination only if it was the MOB destination — operator may
    // have set a new one mid-emergency.
    const d = readDestination();
    if (d?.source === 'mob') clearDestination();
  };

  if (mob) {
    return (
      <button
        type="button"
        className="mob-button mob-button--active"
        onClick={onClear}
        aria-label="MOB active. Tap to clear."
      >
        MOB ACTIVE — CLEAR
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="mob-button"
        onClick={() => setConfirmOpen(true)}
        aria-label="Man overboard. Tap to confirm."
      >
        MOB
      </button>

      {confirmOpen && (
        <SlidePanel open onClose={() => setConfirmOpen(false)} labelledBy="mob-confirm-title">
          <h2 id="mob-confirm-title" className="mob-confirm__title">
            Man overboard
          </h2>
          <p className="mob-confirm__body">
            This will drop a waypoint at your current position and switch to chart view.
          </p>
          <div className="mob-confirm__buttons">
            <button
              type="button"
              className="action-sheet__btn"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="action-sheet__btn action-sheet__btn--mob"
              disabled={!canActivate}
              onClick={onConfirm}
            >
              {canActivate ? 'Confirm — drop MOB waypoint' : 'Waiting for GPS fix…'}
            </button>
          </div>
        </SlidePanel>
      )}
    </>
  );
}
