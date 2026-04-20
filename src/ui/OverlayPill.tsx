// Shared shell for chart-overlay pills: container div + dismiss button +
// session-scoped dismissed-state early-return. Each caller brings its own
// className, role/aria, and body content — we don't try to unify visuals
// beyond what the CSS rules group together.

import type { ReactNode } from 'react';
import { DismissButton } from './DismissButton';
import { dismiss, useIsDismissed } from './dismissStore';

interface Props {
  className: string;
  dismissKey: string;
  dismissLabel: string;
  role?: 'status' | 'group';
  ariaLabel?: string;
  children: ReactNode;
}

export function OverlayPill({
  className,
  dismissKey,
  dismissLabel,
  role = 'status',
  ariaLabel,
  children,
}: Props) {
  const dismissed = useIsDismissed(dismissKey);
  if (dismissed) return null;
  return (
    <div className={className} role={role} aria-label={ariaLabel}>
      <DismissButton onClick={() => dismiss(dismissKey)} label={dismissLabel} />
      {children}
    </div>
  );
}
