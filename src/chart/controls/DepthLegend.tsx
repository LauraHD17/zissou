// Depth-contour color key. Hard square chips + numeric ranges. The labels
// shift with the current tide so they show EFFECTIVE water depth right now
// (not the charted MLW value), matching how the contour lines are colored.
// Dismissible via the shared dismiss store.

import { useSelf } from '../../signalk/useSignalK';
import { useNow } from '../../utils/clock';
import { tideHeightFt } from '../../utils/tides';
import { dismiss, useIsDismissed } from '../../ui/dismissStore';
import { DismissButton } from '../../ui/DismissButton';

const FT_PER_M = 3.28084;
const SHALLOW_M = 1.83; // 6 ft at MLW
const MODERATE_M = 6.1; // 20 ft at MLW

export function DepthLegend() {
  const self = useSelf();
  const now = useNow(5 * 60 * 1000);
  const dismissed = useIsDismissed('depth-legend');
  if (dismissed) return null;

  const pos = self?.position ?? { latitude: 44.4, longitude: -68.8 };
  const tideFt = tideHeightFt(now, pos);

  // Current effective thresholds in feet: charted break + tide above MLW.
  const shallowFt = SHALLOW_M * FT_PER_M + tideFt;
  const moderateFt = MODERATE_M * FT_PER_M + tideFt;

  return (
    <div className="depth-legend" role="group" aria-label="Depth color key">
      <DismissButton onClick={() => dismiss('depth-legend')} label="Hide depth key" />
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
