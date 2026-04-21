// On-chart reference key for NOAA navigational aids. Visual family matches
// DepthLegend exactly — same `.chart-legend` base class, same row layout,
// same position convention. Stacks directly under DepthLegend so the two
// legends read as a single column: color = depth, shape = mark.
//
// Non-dismissible by design: a helm scanning unfamiliar buoys should never
// need to remember where they dismissed a legend to. If screen real estate
// becomes a real problem later, a single settings toggle hides both legends
// together (deferred).

import {
  CardinalGlyph,
  IsolatedDangerGlyph,
  LateralPortGlyph,
  LateralStarboardGlyph,
  LightGlyph,
  SafeWaterGlyph,
  SpecialGlyph,
  WreckGlyph,
} from './navaidGlyphs';
import type { FC } from 'react';

interface Row {
  label: string;
  glyph: FC<{ size?: number; className?: string }>;
}

const ROWS: Row[] = [
  { label: 'Port (red)', glyph: LateralPortGlyph },
  { label: 'Stbd (green)', glyph: LateralStarboardGlyph },
  { label: 'Safe water', glyph: SafeWaterGlyph },
  { label: 'Cardinal', glyph: CardinalGlyph },
  { label: 'Isolated', glyph: IsolatedDangerGlyph },
  { label: 'Special', glyph: SpecialGlyph },
  { label: 'Light', glyph: LightGlyph },
  { label: 'Wreck', glyph: WreckGlyph },
];

export function NavaidLegend() {
  return (
    <div className="chart-legend navaid-legend" role="group" aria-label="Navigation mark key">
      <span className="chart-legend__title">MARKS</span>
      <ul className="chart-legend__rows">
        {ROWS.map(({ label, glyph: Glyph }) => (
          <li key={label} className="chart-legend__row">
            <Glyph />
            <span className="chart-legend__label">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
