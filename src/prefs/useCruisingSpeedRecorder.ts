// Records SOG samples into the cruising-speed store whenever SignalK reports
// a valid in-range speed. Throttled to at most one sample every 30 s so one
// long passage doesn't blow the ring buffer.

import { useEffect, useRef } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { isValidSogMs } from '../signalk/types';
import { msToKnots } from '../utils/units';
import { appendCruisingSpeedSample } from './cruisingSpeedStore';

const SAMPLE_INTERVAL_MS = 30_000;

export function useCruisingSpeedRecorder(): void {
  const self = useSelf();
  const lastSampledAtRef = useRef(0);

  useEffect(() => {
    if (!isValidSogMs(self?.sog)) return;
    const now = Date.now();
    if (now - lastSampledAtRef.current < SAMPLE_INTERVAL_MS) return;
    const kn = msToKnots(self.sog);
    appendCruisingSpeedSample(kn);
    lastSampledAtRef.current = now;
  }, [self?.sog, self?.lastUpdated]);
}
