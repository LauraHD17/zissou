// Active alarm UI — full-bleed flashing border + ARIA-live banner.
//
// WCAG 2.3.1 caps general flashing at <3 Hz; we run at 1 Hz, well under.
// Flash continues even when prefers-reduced-motion is set: this is a SAFETY
// alarm, not decoration; 2.3.1 explicitly exempts critical safety signals.

import { acknowledgeAlarm, useActiveAlarm } from '../alarm/alarmStore';

export function AlarmBanner() {
  const alarm = useActiveAlarm();
  if (!alarm) return null;

  const flashing = !alarm.acknowledged;

  return (
    <>
      {flashing && <div className="alarm-flash" aria-hidden="true" />}
      <div role="alert" aria-live="assertive" className="alarm-banner">
        <span className="alarm-banner__message">{alarm.message}</span>
        {!alarm.acknowledged && (
          <button type="button" className="alarm-banner__ack" onClick={acknowledgeAlarm}>
            Acknowledge
          </button>
        )}
      </div>
    </>
  );
}
