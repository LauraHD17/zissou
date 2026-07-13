// StatusBar gear button + the slide-over panel shell. Settings and Help share
// the panel — no extra StatusBar button (space is precious on the phone) and
// no nested dialogs. The form itself lives in SettingsForm.

import { useState } from 'react';
import { Icon } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import { HelpContent } from '../help/HelpContent';
import { SettingsForm } from './SettingsForm';

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'form' | 'help'>('form');

  const close = () => {
    setOpen(false);
    setView('form');
  };

  return (
    <>
      <button
        type="button"
        className="statusbar__settings-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open settings and help"
      >
        <Icon name="gear" size={20} />
      </button>

      {open && (
        <SlidePanel open onClose={close} labelledBy="settings-title">
          {view === 'help' ? (
            <HelpContent onBack={() => setView('form')} />
          ) : (
            <SettingsForm onDone={close} onHelp={() => setView('help')} />
          )}
        </SlidePanel>
      )}
    </>
  );
}
