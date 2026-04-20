// Watches an active anchor session and raises a warning on the AlarmBanner
// when the tide would drop the water below draft + safety margin within the
// look-ahead window. Only fires when the operator provided a charted depth —
// without it we can't assess grounding risk.

import { useEffect } from 'react';
import { useAnchorWatch } from '../anchor/anchorStore';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { raiseAlarm, clearAlarm, useActiveAlarm } from '../alarm/alarmStore';
import { useNow } from '../utils/clock';
import { assessAnchorageDrying } from './tideAlerts';

const TICK_MS = 5 * 60 * 1000; // 5 min — tide changes slowly

export function useAnchorageDryingAlert(): void {
  const anchor = useAnchorWatch();
  const prefs = useUserPrefs();
  const active = useActiveAlarm();
  const now = useNow(TICK_MS);

  useEffect(() => {
    if (!anchor || anchor.chartedDepthFt == null || prefs.vessel.draftFt == null) {
      if (active?.kind === 'anchorage-drying') clearAlarm();
      return;
    }

    const assess = assessAnchorageDrying({
      now,
      chartedDepthFt: anchor.chartedDepthFt,
      draftFt: prefs.vessel.draftFt,
      safetyMarginFt: prefs.safetyMarginFt,
      pos: anchor.drop,
      hoursAhead: 6,
    });

    if (assess.minsUntilUnsafe != null && assess.imminent) {
      const hrs = Math.round(assess.minsUntilUnsafe / 6) / 10; // 0.1 hr precision
      raiseAlarm({
        kind: 'anchorage-drying',
        message: `Anchorage dries in ~${hrs} hr — tide will drop below your keel clearance.`,
      });
    } else if (active?.kind === 'anchorage-drying') {
      clearAlarm();
    }
  }, [
    now,
    anchor?.drop.latitude,
    anchor?.drop.longitude,
    anchor?.chartedDepthFt,
    prefs.vessel.draftFt,
    prefs.safetyMarginFt,
  ]);
}
