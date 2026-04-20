// Watches own-ship vs the anchor's drop position. Ticks at 1 Hz. When the
// boat drifts beyond the configured radius and the operator hasn't
// acknowledged the alarm, raises an alarm + plays a tone. Re-chirps every
// 10 seconds while still outside.

import { useEffect, useRef } from 'react';
import { useSelf } from '../signalk/useSignalK';
import { isPlausiblePosition, haversineNm } from '../utils/geometry';
import { useNowMs } from '../utils/clock';
import { metersToFeet, feetToMeters, NM_TO_METERS } from '../utils/units';
import { raiseAlarm, clearAlarm } from '../alarm/alarmStore';
import { playAnchorAlarmTone } from '../alarm/useAlarmAudio';
import { useAnchorWatch } from './anchorStore';

const RECHIRP_MS = 10_000;

export function useAnchorDragWatch(): void {
  const anchor = useAnchorWatch();
  const self = useSelf();
  const now = useNowMs(1000);
  const lastChirpRef = useRef<number>(0);

  useEffect(() => {
    if (!anchor) {
      clearAlarm();
      lastChirpRef.current = 0;
      return;
    }
    if (!self?.position || !isPlausiblePosition(self.position)) return;

    const distMeters = haversineNm(anchor.drop, self.position) * NM_TO_METERS;
    const distFt = metersToFeet(distMeters);

    if (distFt <= anchor.radiusFt) {
      // Inside circle — no alarm. Don't clear if already acknowledged:
      // operator may have ack'd, walked back inside, then drifted out again.
      return;
    }

    const overM = Math.round(distMeters - feetToMeters(anchor.radiusFt));
    raiseAlarm({
      kind: 'anchor-drag',
      message: `Anchor dragging — boat is ${overM} m outside watch circle`,
    });
    if (anchor.audioEnabled && now - lastChirpRef.current >= RECHIRP_MS) {
      playAnchorAlarmTone();
      lastChirpRef.current = now;
    }
  }, [anchor, self?.position?.latitude, self?.position?.longitude, now]);
}
