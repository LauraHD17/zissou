// One-tap Help entry — a "?" button in the StatusBar metrics row, visible in
// every view mode and even with the control row collapsed. Opens the same
// HelpContent guide that Settings links to, in its own slide panel.

import { useState } from 'react';
import { Icon } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import { HelpContent } from './HelpContent';

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="statusbar__help"
        onClick={() => setOpen(true)}
        aria-label="Open help guide"
      >
        <Icon name="help" size={20} />
      </button>

      {open && (
        <SlidePanel open onClose={() => setOpen(false)} labelledBy="settings-title">
          <HelpContent onBack={() => setOpen(false)} backLabel="Close help" />
        </SlidePanel>
      )}
    </>
  );
}
