// Watches an active anchor session and raises a warning on the AlarmBanner
// when the tide would drop the water below draft + safety margin within the
// look-ahead window. Only fires when the operator provided a charted depth —
// without it we can't assess grounding risk.

import { useEffect } from 'react';
import { useAnchorWatch } from '../anchor/anchorStore';
import { useUserPrefs } from '../prefs/userPrefsStore';
import { raiseAlarm, clearAlarmIfKind, useActiveAlarm } from '../alarm/alarmStore';
import { useNow } from '../utils/clock';
import { tidesAuthoritative } from '../utils/tides';
import { assessAnchorageDrying, TIDE_LOOKAHEAD_HOURS, TIDE_LOOKAHEAD_MS } from './tideAlerts';

const TICK_MS = 5 * 60 * 1000; // 5 min — tide changes slowly

export function useAnchorageDryingAlert(): void {
  const anchor = useAnchorWatch();
  const prefs = useUserPrefs();
  const active = useActiveAlarm();
  const now = useNow(TICK_MS);

  useEffect(() => {
    if (!anchor || anchor.chartedDepthFt == null || prefs.vessel.draftFt == null) {
      clearAlarmIfKind('anchorage-drying');
      return;
    }

    // Project rule: bad data never drives warnings. When only the M2 stub is
    // available its numbers can be feet off in either direction — stay quiet
    // rather than alarm (or reassure) on fabricated tide heights.
    if (!tidesAuthoritative(now, new Date(now.getTime() + TIDE_LOOKAHEAD_MS), anchor.drop)) {
      clearAlarmIfKind('anchorage-drying');
      return;
    }

    const assess = assessAnchorageDrying({
      now,
      chartedDepthFt: anchor.chartedDepthFt,
      draftFt: prefs.vessel.draftFt,
      safetyMarginFt: prefs.safetyMarginFt,
      pos: anchor.drop,
      hoursAhead: TIDE_LOOKAHEAD_HOURS,
    });

    if (assess.minsUntilUnsafe != null && assess.imminent) {
      const hrs = Math.round(assess.minsUntilUnsafe / 6) / 10; // 0.1 hr precision
      raiseAlarm({
        kind: 'anchorage-drying',
        message: `Anchorage dries in ~${hrs} hr — tide will drop below your keel clearance.`,
      });
    } else {
      clearAlarmIfKind('anchorage-drying');
    }
    // Granular anchor deps: the session object is stable per drop; the fields
    // listed are the only ones the assessment reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    now,
    active?.kind,
    anchor?.drop.latitude,
    anchor?.drop.longitude,
    anchor?.chartedDepthFt,
    prefs.vessel.draftFt,
    prefs.safetyMarginFt,
  ]);
}
