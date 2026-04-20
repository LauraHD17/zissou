// Bottom slide-up panel with backdrop. Powers the AIS detail panel, waypoint
// editor, anchor watch config, and MOB confirm. Accessibility:
//   - role="dialog" + aria-modal
//   - focus trap via sentinel divs (Tab/Shift-Tab cycles within panel)
//   - return focus to trigger element on close
//   - Escape, tap-outside, and swipe-down all dismiss
//   - swipe-down requires Escape/tap-outside as alternatives (WCAG 2.5.7)
//
// Animation gated behind prefers-reduced-motion — under reduced motion the
// panel just appears (no slide / no fade).

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Element id of the heading inside `children` for `aria-labelledby`. */
  labelledBy: string;
  /** Returned-to-focus element on close. Defaults to document.activeElement at open. */
  returnFocusTo?: HTMLElement | null;
  children: ReactNode;
}

const DISMISS_DY_PX = 80;
const DISMISS_VELOCITY = 0.4; // px/ms

export function SlidePanel({ open, onClose, labelledBy, returnFocusTo, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{ startY: number; startTime: number } | null>(null);

  // Capture the trigger element when opening so we can return focus on close.
  useEffect(() => {
    if (!open) return;
    const trigger = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    lastFocusedRef.current = trigger;

    // Focus the first focusable inside the panel.
    const panel = panelRef.current;
    if (panel) {
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
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

  // Swipe-down to close. Pointer events handled on the panel itself; the
  // overlay handles tap-outside separately.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    dragStateRef.current = { startY: e.clientY, startTime: performance.now() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dy = Math.max(0, e.clientY - drag.startY);
    const panel = panelRef.current;
    if (panel) panel.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const dt = performance.now() - drag.startTime;
    const velocity = dy / dt;
    const panel = panelRef.current;
    if (dy > DISMISS_DY_PX || velocity > DISMISS_VELOCITY) {
      onClose();
    } else if (panel) {
      panel.style.transform = '';
    }
  };

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Sentinel: shift-tab from here wraps to the end of the panel. */}
        <div tabIndex={0} onFocus={() => focusLastIn(panelRef.current)} aria-hidden="true" />
        {children}
        {/* Sentinel: tab from here wraps to the start. */}
        <div tabIndex={0} onFocus={() => focusFirstIn(panelRef.current)} aria-hidden="true" />
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
  const real = Array.from(items).filter((el) => !el.hasAttribute('aria-hidden'));
  real[0]?.focus();
}

function focusLastIn(container: HTMLElement | null) {
  if (!container) return;
  const items = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const real = Array.from(items).filter((el) => !el.hasAttribute('aria-hidden'));
  real[real.length - 1]?.focus();
}
