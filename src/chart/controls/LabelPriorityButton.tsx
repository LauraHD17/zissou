// Cycles which chart labels win when place names and depth labels collide.
// Balanced (default) → zoom-based: place names at overview, depth at approach.
// Place-first → place names always visible; depth labels drop on collision.
// Depth-first → depth labels always visible; place names drop on collision.
//
// Keeps state in userPrefsStore so the choice survives reload. The button
// itself is a plain tri-state cycle — tap = next mode, current mode is read
// by screen readers via aria-label and visually via a small corner badge.

import { Icon } from '../../icons';
import { setChartLabelPriority, useUserPrefs } from '../../prefs/userPrefsStore';
import type { ChartLabelPriority } from '../../types/nav';

const NEXT_MODE: Record<ChartLabelPriority, ChartLabelPriority> = {
  balanced: 'place',
  place: 'depth',
  depth: 'balanced',
};

const MODE_LABEL: Record<ChartLabelPriority, string> = {
  balanced: 'Balanced',
  place: 'Place names first',
  depth: 'Depth labels first',
};

export function LabelPriorityButton() {
  const mode = useUserPrefs().chartLabelPriority;
  const next = NEXT_MODE[mode];

  return (
    <button
      type="button"
      className={`map-control-btn map-control-btn--label-priority map-control-btn--label-priority-${mode}`}
      onClick={() => setChartLabelPriority(next)}
      aria-label={`Label priority: ${MODE_LABEL[mode]}. Tap to switch to ${MODE_LABEL[next]}.`}
    >
      <Icon name="tag" size={24} />
    </button>
  );
}
