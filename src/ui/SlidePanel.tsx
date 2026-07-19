// Bottom slide-up panel with backdrop. Powers the AIS detail panel, waypoint
// editor, anchor watch config, and MOB confirm. Accessibility:
//   - role="dialog" + aria-modal
//   - focus trap via sentinel divs (Tab/Shift-Tab cycles within panel)
//   - return focus to trigger element on close
//   - Escape, tap-outside, and the pinned ✕ button all dismiss
//
// There is deliberately NO swipe-to-close gesture. Two generations of it
// (whole-panel y-range, then a dedicated touch-action:none handle strip)
// both kept reading real-device scrolls as dismissals on iOS. Scrolling a
// panel must never be able to close it, so the gesture is gone; the pinned
// ✕ (sticky, stays visible while scrolling) is the guaranteed touch close.
//
// Animation gated behind prefers-reduced-motion — under reduced motion the
// panel just appears (no slide / no fade).

import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Element id of the heading inside `children` for `aria-labelledby`. */
  labelledBy: string;
  /** Returned-to-focus element on close. Defaults to document.activeElement at open. */
  returnFocusTo?: HTMLElement | null;
  children: ReactNode;
}

export function SlidePanel({ open, onClose, labelledBy, returnFocusTo, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Capture the trigger element when opening so we can return focus on close.
  useEffect(() => {
    if (!open) return;
    const trigger = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    lastFocusedRef.current = trigger;

    // Focus the first focusable inside the panel — skipping the focus-trap
    // sentinels: the leading sentinel's onFocus redirects to the LAST
    // control, which opened every long panel scrolled to the bottom. Focus
    // without scrolling, then pin the panel to its top: content must always
    // open at the start regardless of where the first control sits.
    const panel = panelRef.current;
    if (panel) {
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const real = Array.from(items).filter((el) => !el.hasAttribute('data-focus-sentinel'));
      // No real controls (a read-only panel like the AIS detail)? Focus the
      // dialog itself (tabIndex={-1}) — focus must land INSIDE the panel or
      // the Escape-to-close keydown never reaches it.
      (real[0] ?? panel).focus({ preventScroll: true });
      panel.scrollTop = 0;
    }

    // Lock body scroll while panel is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      lastFocusedRef.current?.focus?.();
    };
  }, [open, returnFocusTo]);

  // Escape to close.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="slide-panel-root" onKeyDown={handleKeyDown}>
      {/* Tap-outside to close — overlay catches the tap, not the panel. */}
      <div className="slide-panel-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className="slide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {/* Sentinels: focusable elements must not be aria-hidden (axe
            aria-hidden-focus) — marked with a data attribute instead so the
            wrap helpers can skip them. They redirect focus immediately, so
            they're never announced. */}
        {/* Shift-tab from here wraps to the end of the panel. */}
        <div tabIndex={0} data-focus-sentinel onFocus={() => focusLastIn(panelRef.current)} />
        {/* Pinned close — sticky, so it stays reachable however far the
            panel is scrolled. The guaranteed touch dismissal on phones
            (no Escape key there) for panels without their own buttons. */}
        <button
          type="button"
          className="slide-panel__close"
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </button>
        {children}
        {/* Tab from here wraps to the start. */}
        <div tabIndex={0} data-focus-sentinel onFocus={() => focusFirstIn(panelRef.current)} />
      </aside>
    </div>
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusFirstIn(container: HTMLElement | null) {
  if (!container) return;
  const items = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  // Skip the sentinel divs themselves (first + last).
  const real = Array.from(items).filter((el) => !el.hasAttribute('data-focus-sentinel'));
  real[0]?.focus();
}

function focusLastIn(container: HTMLElement | null) {
  if (!container) return;
  const items = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const real = Array.from(items).filter((el) => !el.hasAttribute('data-focus-sentinel'));
  real[real.length - 1]?.focus();
}
