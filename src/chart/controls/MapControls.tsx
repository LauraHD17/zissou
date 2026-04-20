import { Icon } from '../../icons';
import type { ChartMode } from '../hooks/useChartMode';
import { LabelPriorityButton } from './LabelPriorityButton';

interface Props {
  mode: ChartMode;
  /** True when the chart is auto-tracking own-ship. False when the user has
   *  panned/zoomed away; Recenter button shows a drift indicator. */
  following: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onModeToggle: () => void;
  /** Slots for feature-owned controls — keeps MapControls ignorant of
      feature state while preserving the visual stack. */
  dropPinSlot?: React.ReactNode;
  saveWaypointSlot?: React.ReactNode;
  anchorSlot?: React.ReactNode;
}

export function MapControls({
  mode,
  following,
  onZoomIn,
  onZoomOut,
  onRecenter,
  onModeToggle,
  dropPinSlot,
  saveWaypointSlot,
  anchorSlot,
}: Props) {
  return (
    <div className="map-control-stack" role="group" aria-label="Map controls">
      <ControlButton onClick={onZoomIn} aria-label="Zoom in">
        +
      </ControlButton>
      <ControlButton onClick={onZoomOut} aria-label="Zoom out">
        −
      </ControlButton>
      <ControlButton
        onClick={onRecenter}
        aria-label={following ? 'Recenter on own ship' : 'Off-track — tap to recenter on own ship'}
        className={following ? undefined : 'map-control-btn--drift'}
      >
        <Icon name="recenter" size={24} />
      </ControlButton>
      <ControlButton
        onClick={onModeToggle}
        aria-label={mode === 'marine' ? 'Switch to harbor mode' : 'Switch to marine mode'}
        aria-pressed={mode === 'harbor'}
      >
        <Icon name={mode === 'marine' ? 'wave' : 'streets'} size={24} />
      </ControlButton>
      <LabelPriorityButton />
      {dropPinSlot}
      {saveWaypointSlot}
      {anchorSlot}
    </div>
  );
}

function ControlButton({
  onClick,
  children,
  className,
  ...props
}: { onClick: () => void; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
>) {
  return (
    <button
      type="button"
      className={`map-control-btn${className ? ` ${className}` : ''}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
