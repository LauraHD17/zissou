// Marine on-screen keyboard — bottom-docked, full-width, touch-first. Designed
// for a Pi 4 touchscreen on a moving deck: 64px keys, hard-rectangle aesthetic,
// no animations, token-driven colors so the whole thing flips to night-vision
// red automatically.
//
// Two layouts, swappable via the mode button:
//   - 'alpha'   — QWERTY with auto-capitalize at start/after-space, momentary shift
//   - 'numeric' — phone-style 3x4 pad (no negative; nav fields don't need it)
//
// Physical USB keyboards still work when the keypad is closed (the host <input>
// accepts text normally). When the keypad is OPEN, the host input is set to
// inputMode="none" to suppress any OS virtual keyboard that might otherwise
// race ours. The keypad's role="dialog" overlay takes focus; Escape cancels.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { pushKeypadRecent, useKeypadRecents } from './keypadRecentsStore';

type Mode = 'alpha' | 'numeric';

interface Props {
  open: boolean;
  value: string;
  onChange: (next: string) => void;
  onDone: () => void;
  onCancel: () => void;
  /** Starting layout. User can switch at runtime via the 123/ABC key. */
  initialMode?: Mode;
  /** Stable key for the recent-entries chip row. Omit to hide chips. */
  fieldKey?: string;
  /** Cap for the displayed/committed value. */
  maxLength?: number;
  /** Accessible name for the keypad dialog (e.g. "Keyboard: waypoint name"). */
  label?: string;
}

const ALPHA_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const NUM_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0'],
];

export function MarineKeypad({
  open,
  value,
  onChange,
  onDone,
  onCancel,
  initialMode = 'alpha',
  fieldKey,
  maxLength,
  label = 'On-screen keyboard',
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  // Momentary shift: flips the case of the NEXT letter only, then resets.
  // 'auto' lets the keypad capitalize at word starts without the user lifting
  // a finger — a boat operator shouldn't have to think about casing.
  const [shift, setShift] = useState<'auto' | 'on' | 'off'>('auto');
  const panelRef = useRef<HTMLDivElement>(null);
  const recents = useKeypadRecents(fieldKey ?? '');

  // Reset per-open state whenever the keypad transitions closed → open.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setShift('auto');
    }
  }, [open, initialMode]);

  // Focus the panel on open, restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const atWordStart = value.length === 0 || value.endsWith(' ');
  const uppercase = mode === 'alpha' && (shift === 'on' || (shift === 'auto' && atWordStart));

  const insert = useCallback(
    (ch: string) => {
      const addition = uppercase ? ch.toUpperCase() : ch;
      const next = value + addition;
      if (maxLength !== undefined && next.length > maxLength) return;
      onChange(next);
      // Momentary shift drops after one letter; auto-shift will re-engage on
      // its own at the next word boundary.
      if (shift === 'on') setShift('auto');
    },
    [maxLength, onChange, shift, uppercase, value],
  );

  const backspace = useCallback(() => {
    if (!value) return;
    onChange(value.slice(0, -1));
  }, [onChange, value]);

  const space = useCallback(() => {
    if (maxLength !== undefined && value.length >= maxLength) return;
    onChange(value + ' ');
  }, [maxLength, onChange, value]);

  const commit = useCallback(() => {
    if (fieldKey) pushKeypadRecent(fieldKey, value);
    onDone();
  }, [fieldKey, onDone, value]);

  const chooseRecent = useCallback(
    (v: string) => {
      const capped = maxLength !== undefined ? v.slice(0, maxLength) : v;
      onChange(capped);
    },
    [maxLength, onChange],
  );

  // Keys mustn't steal focus from the dialog — pointerdown + preventDefault
  // keeps the keypad itself focused and avoids a focus-ring flicker per tap.
  const keyDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    },
    [commit, onCancel],
  );

  const display = useMemo(() => value, [value]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="marine-keypad"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKey}
    >
      {/* Readout — shows the value being typed at display scale.
          aria-live lets a screen reader announce edits without focus moves. */}
      <div className="marine-keypad__readout" aria-live="polite" aria-atomic="true">
        <span className="marine-keypad__value">
          {display || <span className="marine-keypad__placeholder">&nbsp;</span>}
        </span>
        <span className="marine-keypad__caret" aria-hidden="true" />
      </div>

      {/* Recent chips — zero-keystroke recall of common values. */}
      {fieldKey && recents.length > 0 && (
        <div className="marine-keypad__chips" role="list" aria-label="Recent entries">
          {recents.map((r) => (
            <button
              key={r}
              type="button"
              role="listitem"
              className="marine-keypad__chip"
              onPointerDown={keyDown}
              onClick={() => chooseRecent(r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {mode === 'alpha' ? (
        <AlphaGrid
          uppercase={uppercase}
          shift={shift}
          onInsert={insert}
          onBackspace={backspace}
          onShift={() => setShift((s) => (s === 'auto' ? 'on' : s === 'on' ? 'off' : 'auto'))}
          onPointerDown={keyDown}
        />
      ) : (
        <NumericGrid onInsert={insert} onBackspace={backspace} onPointerDown={keyDown} />
      )}

      {/* Bottom action row — mode toggle on left, space + punctuation centre, commit on right. */}
      <div className="marine-keypad__actions">
        <button
          type="button"
          className="marine-keypad__action marine-keypad__action--mode"
          onPointerDown={keyDown}
          onClick={() => setMode((m) => (m === 'alpha' ? 'numeric' : 'alpha'))}
          aria-label={mode === 'alpha' ? 'Switch to numbers' : 'Switch to letters'}
        >
          {mode === 'alpha' ? '123' : 'ABC'}
        </button>

        {mode === 'alpha' && (
          <button
            type="button"
            className="marine-keypad__action marine-keypad__action--space"
            onPointerDown={keyDown}
            onClick={space}
            aria-label="Space"
          >
            space
          </button>
        )}

        <button
          type="button"
          className="marine-keypad__action marine-keypad__action--cancel"
          onPointerDown={keyDown}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="marine-keypad__action marine-keypad__action--done"
          onPointerDown={keyDown}
          onClick={commit}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Alpha grid ─────────────────────────────────────────────────────────────

interface AlphaGridProps {
  uppercase: boolean;
  shift: 'auto' | 'on' | 'off';
  onInsert: (ch: string) => void;
  onBackspace: () => void;
  onShift: () => void;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
}

function AlphaGrid({
  uppercase,
  shift,
  onInsert,
  onBackspace,
  onShift,
  onPointerDown,
}: AlphaGridProps) {
  const shiftLabel =
    shift === 'on'
      ? 'Shift on, next letter uppercase'
      : shift === 'off'
        ? 'Shift off, letters lowercase'
        : 'Shift automatic';

  return (
    <div className="marine-keypad__grid">
      <div className="marine-keypad__row">
        {ALPHA_ROWS[0].map((ch) => (
          <KeyBtn key={ch} onClick={() => onInsert(ch)} onPointerDown={onPointerDown}>
            {uppercase ? ch.toUpperCase() : ch}
          </KeyBtn>
        ))}
      </div>
      <div className="marine-keypad__row marine-keypad__row--indent">
        {ALPHA_ROWS[1].map((ch) => (
          <KeyBtn key={ch} onClick={() => onInsert(ch)} onPointerDown={onPointerDown}>
            {uppercase ? ch.toUpperCase() : ch}
          </KeyBtn>
        ))}
      </div>
      <div className="marine-keypad__row">
        <KeyBtn
          onClick={onShift}
          onPointerDown={onPointerDown}
          className={`marine-keypad__key--shift marine-keypad__key--shift-${shift}`}
          ariaLabel={shiftLabel}
        >
          ⇧
        </KeyBtn>
        {ALPHA_ROWS[2].map((ch) => (
          <KeyBtn key={ch} onClick={() => onInsert(ch)} onPointerDown={onPointerDown}>
            {uppercase ? ch.toUpperCase() : ch}
          </KeyBtn>
        ))}
        <KeyBtn
          onClick={onBackspace}
          onPointerDown={onPointerDown}
          className="marine-keypad__key--back"
          ariaLabel="Backspace"
        >
          ⌫
        </KeyBtn>
      </div>
    </div>
  );
}

// ── Numeric grid ───────────────────────────────────────────────────────────

interface NumericGridProps {
  onInsert: (ch: string) => void;
  onBackspace: () => void;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
}

function NumericGrid({ onInsert, onBackspace, onPointerDown }: NumericGridProps) {
  return (
    <div className="marine-keypad__grid marine-keypad__grid--numeric">
      {NUM_ROWS.map((row, i) => (
        <div key={i} className="marine-keypad__row">
          {row.map((ch) => (
            <KeyBtn
              key={ch}
              onClick={() => onInsert(ch)}
              onPointerDown={onPointerDown}
              className="marine-keypad__key--num"
            >
              {ch}
            </KeyBtn>
          ))}
          {i === NUM_ROWS.length - 1 && (
            <KeyBtn
              onClick={onBackspace}
              onPointerDown={onPointerDown}
              className="marine-keypad__key--num marine-keypad__key--back"
              ariaLabel="Backspace"
            >
              ⌫
            </KeyBtn>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Generic key button ─────────────────────────────────────────────────────

interface KeyBtnProps {
  onClick: () => void;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

function KeyBtn({ onClick, onPointerDown, className, ariaLabel, children }: KeyBtnProps) {
  return (
    <button
      type="button"
      className={`marine-keypad__key${className ? ` ${className}` : ''}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
