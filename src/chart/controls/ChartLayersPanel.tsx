// Chart layers panel — lets the operator hide NOAA detail they don't want
// on screen (e.g. turn off spot soundings in a tight harbor where the
// numbers crowd the route). Absorbs the old label-priority tri-state as
// one row so the Map-Controls row has a single dedicated "layers"
// affordance.
//
// Personal state (own-ship, AIS targets, saved waypoints, active route)
// is deliberately NOT toggled here — those are session context, not chart
// content. If the user ever wants to hide AIS, that's a separate "traffic"
// toggle on the StatusBar.

import { SlidePanel } from '../../ui/SlidePanel';
import {
  setChartLabelPriority,
  setChartLayerVisible,
  useUserPrefs,
} from '../../prefs/userPrefsStore';
import type {
  ChartLabelPriority,
  ChartLayerPrefs,
} from '../../types/nav';

interface LayerRow {
  key: keyof ChartLayerPrefs;
  title: string;
  description: string;
}

// Order matches the on-screen legends (Depth → Spot Depths → Marks) so the
// operator can scan the panel and map each toggle to what they see.
const LAYERS: LayerRow[] = [
  {
    key: 'contours',
    title: 'Depth contours',
    description: 'Colored lines showing how the bottom drops off.',
  },
  {
    key: 'soundings',
    title: 'Spot depths',
    description: 'Small numbers scattered across the water.',
  },
  {
    key: 'navaids',
    title: 'Buoys & beacons',
    description: 'Port, starboard, cardinal, and special marks.',
  },
  {
    key: 'lights',
    title: 'Lights',
    description: 'Navigational lights with their flash pattern.',
  },
  {
    key: 'hazards',
    title: 'Wrecks & obstructions',
    description: 'Things that will stop your boat.',
  },
];

const LABEL_PRIORITY_OPTIONS: { value: ChartLabelPriority; label: string; sub: string }[] = [
  { value: 'balanced', label: 'Balanced', sub: 'places at low zoom, depths at high zoom' },
  { value: 'place', label: 'Place names', sub: 'always visible; depth drops on crowd' },
  { value: 'depth', label: 'Depth numbers', sub: 'always visible; place names drop on crowd' },
];

interface Props {
  onClose: () => void;
}

export function ChartLayersPanel({ onClose }: Props) {
  const prefs = useUserPrefs();
  return (
    <SlidePanel open onClose={onClose} labelledBy="chart-layers-title">
      <article className="chart-layers">
        <h2 id="chart-layers-title" className="chart-layers__title">
          Chart layers
        </h2>
        <p className="chart-layers__intro">
          Hide anything you don't want on screen right now. Your boat, AIS
          traffic, and saved spots always stay visible.
        </p>

        <ul className="chart-layers__rows">
          {LAYERS.map((row) => (
            <li key={row.key} className="chart-layers__row">
              <label className="chart-layers__label">
                <input
                  type="checkbox"
                  checked={prefs.chartLayers[row.key]}
                  onChange={(e) => setChartLayerVisible(row.key, e.target.checked)}
                  className="chart-layers__checkbox"
                />
                <span className="chart-layers__text">
                  <span className="chart-layers__heading">{row.title}</span>
                  <span className="chart-layers__description">{row.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <h3 className="chart-layers__subtitle">Label priority</h3>
        <p className="chart-layers__intro">
          When labels crowd — place names or depth numbers — decide which wins.
        </p>
        <ul className="chart-layers__rows">
          {LABEL_PRIORITY_OPTIONS.map((opt) => (
            <li key={opt.value} className="chart-layers__row">
              <label className="chart-layers__label">
                <input
                  type="radio"
                  name="chart-label-priority"
                  value={opt.value}
                  checked={prefs.chartLabelPriority === opt.value}
                  onChange={() => setChartLabelPriority(opt.value)}
                  className="chart-layers__checkbox"
                />
                <span className="chart-layers__text">
                  <span className="chart-layers__heading">{opt.label}</span>
                  <span className="chart-layers__description">{opt.sub}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </article>
    </SlidePanel>
  );
}
