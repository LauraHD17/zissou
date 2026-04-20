// StatusBar entry to the WaypointsPanel (saved + recents + save-current).
// Uses the `more` kebab icon — per plan, this is the hamburger-style doorway
// to the full waypoints list.

import { useState } from 'react';
import { Icon } from '../icons';
import { WaypointsPanel } from '../waypoints/WaypointsPanel';

export function WaypointsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="statusbar__waypoints-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open waypoints"
      >
        <Icon name="more" size={20} />
      </button>

      {open && <WaypointsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
