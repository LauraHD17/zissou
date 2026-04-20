// Depth-contour color key. Labels reflect current EFFECTIVE water depth
// (charted + tide height) so they match what the contour lines actually
// show right now, not the MLW-referenced values. Top-left of the chart.

import { useSelf } from '../../signalk/useSignalK';
import { useNow } from '../../utils/clock';
import { FALLBACK_POS } from '../../utils/geometry';
import { metersToFeet } from '../../utils/units';
import { tideHeightFt } from '../../utils/tides';
import { OverlayPill } from '../../ui/OverlayPill';
import { DEPTH_BREAK_MODERATE_M, DEPTH_BREAK_SHALLOW_M } from '../marineStyle';

export function DepthLegend() {
  const self = useSelf();
  const now = useNow(5 * 60 * 1000);
  const pos = self?.position ?? FALLBACK_POS;
  const tideFt = tideHeightFt(now, pos);
  const shallowFt = metersToFeet(DEPTH_BREAK_SHALLOW_M) + tideFt;
  const moderateFt = metersToFeet(DEPTH_BREAK_MODERATE_M) + tideFt;

  return (
    <OverlayPill
      className="depth-legend"
      dismissKey="depth-legend"
      dismissLabel="Hide depth key"
      role="group"
      ariaLabel="Depth color key"
    >
      <span className="depth-legend__title">DEPTH</span>
      <ul className="depth-legend__rows">
        <Row color="shallow" label={`< ${formatFtCompact(shallowFt)}`} name="Shallow" />
        <Row
          color="moderate"
          label={`${formatFtCompact(shallowFt)}–${formatFtCompact(moderateFt)}`}
          name="Moderate"
        />
        <Row color="deep" label={`${formatFtCompact(moderateFt)}+`} name="Deep" />
      </ul>
      <span className="depth-legend__footer">tide +{tideFt.toFixed(1)}</span>
    </OverlayPill>
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
    <li className="depth-legend__row">
      <span className={`depth-legend__swatch depth-legend__swatch--${color}`} aria-label={name} />
      <span className="depth-legend__range">{label}</span>
    </li>
  );
}

function formatFtCompact(ft: number): string {
  if (ft < 0) return '0';
  return `${Math.round(ft)}ft`;
}
