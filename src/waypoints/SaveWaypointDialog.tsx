// Save current destination position as a named waypoint. Opens via the
// "Save to waypoints" action in the destination widget's action sheet.

import { useState } from 'react';
import { Icon, type IconName } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import type { Position } from '../signalk/types';
import type { WaypointCategory } from '../types/nav';
import { addWaypoint } from './waypointStore';

const CATEGORIES: { value: WaypointCategory; icon: IconName; label: string }[] = [
  { value: 'mooring', icon: 'mooringBuoy', label: 'Mooring' },
  { value: 'anchorage', icon: 'anchor', label: 'Anchorage' },
  { value: 'hazard', icon: 'warning', label: 'Hazard' },
  { value: 'poi', icon: 'star', label: 'Spot' },
];

interface Props {
  position: Position;
  onClose: () => void;
}

export function SaveWaypointDialog({ position, onClose }: Props) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<WaypointCategory>('poi');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    addWaypoint({
      lat: position.latitude,
      lon: position.longitude,
      label: trimmed,
      category,
    });
    onClose();
  };

  return (
    <SlidePanel open onClose={onClose} labelledBy="save-wp-title">
      <form onSubmit={submit} className="save-wp">
        <h2 id="save-wp-title" className="save-wp__title">Save this spot</h2>
        <p className="save-wp__pos">{position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}</p>

        <label className="save-wp__field">
          <span>Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Camden mooring 14"
            autoFocus
            maxLength={40}
          />
        </label>

        <fieldset className="save-wp__categories">
          <legend>Category</legend>
          <div className="save-wp__category-grid">
            {CATEGORIES.map((c) => (
              <label
                key={c.value}
                className={`save-wp__category${category === c.value ? ' save-wp__category--active' : ''}`}
              >
                <input
                  type="radio"
                  name="wp-cat"
                  value={c.value}
                  checked={category === c.value}
                  onChange={() => setCategory(c.value)}
                />
                <Icon name={c.icon} size={24} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="save-wp__submit" disabled={!label.trim()}>
          Save spot
        </button>
      </form>
    </SlidePanel>
  );
}
