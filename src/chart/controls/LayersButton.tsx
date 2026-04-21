// Opens the chart-layers panel. Replaces the old tri-state
// LabelPriorityButton — label-priority now lives INSIDE the panel as one
// row among the visibility toggles. Layers icon is three stacked rhombi,
// visually distinct from the wave / marina / anchor glyphs already in use.

import { useState } from 'react';
import { Icon } from '../../icons';
import { ChartLayersPanel } from './ChartLayersPanel';

export function LayersButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="map-control-btn"
        onClick={() => setOpen(true)}
        aria-label="Chart layers. Tap to show or hide buoys, soundings, and other chart details."
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="layers" size={24} />
      </button>
      {open && <ChartLayersPanel onClose={() => setOpen(false)} />}
    </>
  );
}
