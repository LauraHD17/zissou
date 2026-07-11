// Depth-contour color key. The color thresholds are EFFECTIVE water depth —
// depthColorExpressionForTide shifts the contour breaks by the tide so red
// always marks "< 6 ft of water right now" at any tide. That makes the
// labels tide-INVARIANT: adding the tide here would double-count it (the
// old bug: at a +4 ft tide the key claimed "< 10ft" while red still meant
// < 6 ft of water). The footer carries the live tide reading instead.

import { useSelf } from '../../signalk/useSignalK';
import { useNow } from '../../utils/clock';
import { FALLBACK_POS } from '../../utils/geometry';
import { metersToFeet } from '../../utils/units';
import { tideHeightNow } from '../../utils/tides';
import { DEPTH_BREAK_MODERATE_M, DEPTH_BREAK_SHALLOW_M } from '../style/depthExpressions';

// Non-dismissible — the depth key is a chart-reading reference, not a
// transient notification, so it stays permanent at the top-left.
export function DepthLegend() {
  const self = useSelf();
  const now = useNow(5 * 60 * 1000);
  const pos = self?.position ?? FALLBACK_POS;
  const reading = tideHeightNow(now, pos);
  const tideFt = reading.isEstimate ? 0 : reading.heightFt;
  const shallowFt = metersToFeet(DEPTH_BREAK_SHALLOW_M);
  const moderateFt = metersToFeet(DEPTH_BREAK_MODERATE_M);

  return (
    <div className="chart-legend depth-legend" role="group" aria-label="Depth color key">
      <span className="chart-legend__title">DEPTH</span>
      <ul className="chart-legend__rows">
        <Row color="shallow" label={`< ${formatFtCompact(shallowFt)}`} name="Shallow" />
        <Row
          color="moderate"
          label={`${formatFtCompact(shallowFt)}–${formatFtCompact(moderateFt)}`}
          name="Moderate"
        />
        <Row color="deep" label={`${formatFtCompact(moderateFt)}+`} name="Deep" />
      </ul>
      <span className="depth-legend__footer">
        {reading.isEstimate
          ? 'tide unknown — charted depths'
          : `tide ${tideFt >= 0 ? '+' : ''}${tideFt.toFixed(1)}`}
      </span>
    </div>
  );
}

function Row({
  color,
  label,
  name,
}: {
  color: 'shallow' | 'moderate' | 'deep';
  label: string;
  name: string;
}) {
  return (
    <li className="chart-legend__row">
      <span className={`depth-legend__swatch depth-legend__swatch--${color}`} aria-label={name} />
      <span className="chart-legend__label">{label}</span>
    </li>
  );
}

function formatFtCompact(ft: number): string {
  if (ft < 0) return '0';
  return `${Math.round(ft)}ft`;
}
