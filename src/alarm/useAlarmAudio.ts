// WebAudio alarm tones — synthesized oscillators, no audio file dependency.
// AudioContext is initialized lazily on the operator's first user gesture
// (any pointerdown / keydown), satisfying browser autoplay policy without
// a blocking modal.

import { useEffect } from 'react';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Attach a one-time gesture listener at the App root. The first
 * pointerdown/keydown triggers AudioContext creation+resume, which unlocks
 * every subsequent alarm sound. Listener removes itself after firing.
 */
export function useAudioPriming() {
  useEffect(() => {
    const prime = () => {
      const c = getCtx();
      if (c && c.state === 'suspended') c.resume().catch(() => undefined);
    };
    const opts = { once: true, capture: true } as AddEventListenerOptions;
    document.addEventListener('pointerdown', prime, opts);
    document.addEventListener('keydown', prime, opts);
    return () => {
      document.removeEventListener('pointerdown', prime, opts);
      document.removeEventListener('keydown', prime, opts);
    };
  }, []);
}

interface ToneSpec {
  /** Frequency in Hz, OR an array for alternating tones. */
  freq: number | number[];
  /** Each segment's duration in ms when freq is an array. */
  segmentMs?: number;
  /** Total burst duration in ms. */
  durationMs: number;
  /** 0–1 gain. */
  volume?: number;
}

/** Plays a one-shot burst. Returns void; fire-and-forget. */
export function playTone({ freq, segmentMs = 250, durationMs, volume = 0.4 }: ToneSpec): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;

  const gain = c.createGain();
  gain.gain.value = volume;
  gain.connect(c.destination);

  const start = c.currentTime;
  const stopAt = start + durationMs / 1000;

  if (Array.isArray(freq)) {
    // Schedule alternating-tone oscillator: rebuild on each segment boundary
    // since we can't change `osc.frequency` and have it sound clean across
    // long bursts. Cheap given short bursts.
    let t = start;
    let i = 0;
    while (t < stopAt) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq[i % freq.length];
      osc.connect(gain);
      osc.start(t);
      osc.stop(Math.min(t + segmentMs / 1000, stopAt));
      t += segmentMs / 1000;
      i++;
    }
  } else {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(start);
    osc.stop(stopAt);
  }
}

/** Anchor-drag two-tone chirp, designed to read as marine alarm not phone notification. */
export function playAnchorAlarmTone(): void {
  playTone({ freq: [880, 660], segmentMs: 250, durationMs: 1200, volume: 0.5 });
}

/** MOB activation confirm: one sharp high beep. */
export function playMobConfirmTone(): void {
  playTone({ freq: 1200, durationMs: 200, volume: 0.6 });
}

/** Quiet reminder while MOB is active: low chirp. */
export function playMobActivePulse(): void {
  playTone({ freq: 440, durationMs: 150, volume: 0.25 });
}
