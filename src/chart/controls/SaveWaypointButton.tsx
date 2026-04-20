// Toggles save-waypoint mode. When armed, a chart tap/drag opens the
// waypoint editor pre-filled with the picked position. Same visual pattern
// as DropPinButton; uses the star icon since it's the "save a spot" action.

import { Icon } from '../../icons';

interface Props {
  armed: boolean;
  onToggle: () => void;
}

export function SaveWaypointButton({ armed, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`map-control-btn${armed ? ' map-control-btn--active' : ''}`}
      onClick={onToggle}
      aria-label={
        armed
          ? 'Save-waypoint mode armed. Tap the chart to save a spot.'
          : 'Save a spot on the chart. Tap to arm, then tap the chart to place.'
      }
      aria-pressed={armed}
    >
      <Icon name="star" size={24} />
    </button>
  );
}
