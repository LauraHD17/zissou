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

  // Swipe-down to close — armed ONLY from the dedicated handle strip (its
  // own element, `touch-action: none`), never from the content. A y-range
  // check on the whole panel used to overlap the title/first controls, so
  // starting a SCROLL near the top read as a swipe-away — long panels
  // (Settings, Help) became unreadable on the phone. The overlay handles
  // tap-outside separately; Escape and the buttons remain as alternatives.
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
  // The browser reclaimed the gesture (e.g. it became a scroll) — that is an
  // abort, NOT a release: treating it as one dismissed panels mid-scroll.
  const onPointerCancel = () => {
    dragStateRef.current = null;
    const panel = panelRef.current;
    if (panel) panel.style.transform = '';
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
        tabIndex={-1}
      >
        {/* Grab strip — the ONLY zone that arms swipe-to-close. Its
            touch-action: none keeps the browser from turning the drag into
            a scroll; the content below scrolls natively, un-dismissably. */}
        <div
          className="slide-panel__handle-zone"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="slide-panel__handle" />
        </div>
        {/* Sentinels: focusable elements must not be aria-hidden (axe
            aria-hidden-focus) — marked with a data attribute instead so the
            wrap helpers can skip them. They redirect focus immediately, so
            they're never announced. */}
        {/* Shift-tab from here wraps to the end of the panel. */}
        <div tabIndex={0} data-focus-sentinel onFocus={() => focusLastIn(panelRef.current)} />
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
