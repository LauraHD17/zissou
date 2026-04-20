// Create or edit a saved waypoint. Handles both modes:
//   - create: pass `position`; submit calls addWaypoint
//   - edit:   pass `waypoint`; submit calls updateWaypoint
// Only one of the two is supplied per call.

import { useState } from 'react';
import { Icon, type IconName } from '../icons';
import { SlidePanel } from '../ui/SlidePanel';
import type { Position } from '../signalk/types';
import type { SavedWaypoint, WaypointCategory } from '../types/nav';
import { addWaypoint, updateWaypoint } from './waypointStore';

const CATEGORIES: { value: WaypointCategory; icon: IconName; label: string }[] = [
  { value: 'mooring', icon: 'mooringBuoy', label: 'Mooring' },
  { value: 'anchorage', icon: 'anchor', label: 'Anchorage' },
  { value: 'hazard', icon: 'hazard', label: 'Hazard' },
  { value: 'poi', icon: 'star', label: 'Favorite' },
];

type Props =
  | { mode: 'create'; position: Position; onClose: () => void }
  | { mode: 'edit'; waypoint: SavedWaypoint; onClose: () => void };

export function WaypointEditor(props: Props) {
  const isEdit = props.mode === 'edit';
  const initialLabel = isEdit ? props.waypoint.label : '';
  const initialCategory: WaypointCategory = isEdit ? props.waypoint.category : 'poi';
  const position: Position = isEdit
    ? { latitude: props.waypoint.lat, longitude: props.waypoint.lon }
    : props.position;

  const [label, setLabel] = useState(initialLabel);
  const [category, setCategory] = useState<WaypointCategory>(initialCategory);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    if (isEdit) {
      updateWaypoint(props.waypoint.id, { label: trimmed, category });
    } else {
      addWaypoint({
        lat: position.latitude,
        lon: position.longitude,
        label: trimmed,
        category,
      });
    }
    props.onClose();
  };

  const title = isEdit ? 'Edit waypoint' : 'Save this spot';
  const submitText = isEdit ? 'Save changes' : 'Save spot';

  return (
    <SlidePanel open onClose={props.onClose} labelledBy="wp-editor-title">
      <form onSubmit={submit} className="save-wp">
        <h2 id="wp-editor-title" className="save-wp__title">
          {title}
        </h2>
        <p className="save-wp__pos">
          {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
        </p>

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
          {submitText}
        </button>
      </form>
    </SlidePanel>
  );
}
