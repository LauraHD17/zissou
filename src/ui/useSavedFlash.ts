// Shared "Saved ✓" confirmation for forms: flash the confirmation on the
// submit button (and announce it politely to screen readers), THEN close.
// A panel that just vanishes on Save leaves the user unsure anything stuck.

import { useEffect, useRef, useState } from 'react';

export const SAVED_FLASH_MS = 900;

export function useSavedFlash(onAfter: () => void, delayMs: number = SAVED_FLASH_MS) {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const trigger = () => {
    if (saved) return; // double-submit guard while the flash is showing
    setSaved(true);
    timerRef.current = window.setTimeout(onAfter, delayMs);
  };

  return { saved, trigger };
}
