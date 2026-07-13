// Ship's log: narrative day entries generated from the recorded track,
// dwell stops, and logged actions. Read-only — the log writes itself while
// you run the boat. Each day shares as plain text (Web Share on the phone,
// clipboard elsewhere).

import { useMemo, useState } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { useBreadcrumbs } from '../breadcrumbs/breadcrumbStore';
import { useWaypoints } from '../waypoints/waypointStore';
import { useLogEvents } from './logEventStore';
import { buildLogbookDays, formatLogbookEntry, type LogbookDay } from './buildLogbook';

interface Props {
  onClose: () => void;
}

export function LogbookPanel({ onClose }: Props) {
  const crumbs = useBreadcrumbs();
  const waypoints = useWaypoints();
  const events = useLogEvents();

  const days = useMemo(
    () => buildLogbookDays({ crumbs, waypoints, events }),
    [crumbs, waypoints, events],
  );

  return (
    <SlidePanel open onClose={onClose} labelledBy="logbook-title">
      <div className="logbook">
        <h2 id="logbook-title" className="logbook__title">
          Ship's log
        </h2>
        {days.length === 0 ? (
          <p className="logbook__empty">
            Nothing logged yet. The log writes itself as you run the boat — departures, distance
            run, and stops show up here.
          </p>
        ) : (
          <ul className="logbook__days">
            {days.map((day) => (
              <DayEntry key={day.dayStart} day={day} />
            ))}
          </ul>
        )}
      </div>
    </SlidePanel>
  );
}

function DayEntry({ day }: { day: LogbookDay }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = formatLogbookEntry(day);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Share sheet dismissed or clipboard denied — nothing to clean up.
    }
  };

  return (
    <li className="logbook__day">
      <div className="logbook__day-head">
        <h3 className="logbook__day-title">{day.title}</h3>
        <button type="button" className="logbook__share" onClick={share} aria-live="polite">
          {copied ? 'Copied ✓' : 'Share'}
        </button>
      </div>
      <ul className="logbook__lines">
        {day.lines.map((line) => (
          <li key={line} className="logbook__line">
            {line}
          </li>
        ))}
      </ul>
    </li>
  );
}
