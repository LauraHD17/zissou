import { Icon } from '../../icons';
import type { ChartMode } from '../hooks/useChartMode';

interface Props {
  mode: ChartMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onModeToggle: () => void;
}

export function MapControls({
  mode,
  onZoomIn,
  onZoomOut,
  onRecenter,
  onModeToggle,
}: Props) {
  return (
    <div className="map-control-stack" role="group" aria-label="Map controls">
      <ControlButton onClick={onZoomIn} aria-label="Zoom in">+</ControlButton>
      <ControlButton onClick={onZoomOut} aria-label="Zoom out">−</ControlButton>
      <ControlButton onClick={onRecenter} aria-label="Recenter on own ship">
        <Icon name="recenter" size={24} />
      </ControlButton>
      <ControlButton
        onClick={onModeToggle}
        aria-label={mode === 'marine' ? 'Switch to harbor mode' : 'Switch to marine mode'}
        aria-pressed={mode === 'harbor'}
      >
        <Icon name={mode === 'marine' ? 'wave' : 'streets'} size={24} />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick,
  children,
  ...props
}: { onClick: () => void; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
>) {
  return (
    <button type="button" className="map-control-btn" onClick={onClick} {...props}>
      {children}
    </button>
  );
}
