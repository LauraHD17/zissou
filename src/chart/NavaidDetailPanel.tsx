// Plain-language detail sheet for a tapped chart feature — nav-aid or spot
// sounding. Shape and dismissal mirror AISDetailPanel: both are bottom
// SlidePanels with focus trap / Escape / swipe-down / tap-outside already
// handled by the shared component. S-57 → English lives in navaidNarrative.ts.
//
// For spot soundings specifically, the panel ALSO renders a live "right now"
// depth line that adds the current tide to the charted low-tide number, so
// a novice operator can learn what the chart-number means while using it.

import { useSelf } from '../signalk/useSignalK';
import { useNow } from '../utils/clock';
import { FALLBACK_POS } from '../utils/geometry';
import { tideHeightFt } from '../utils/tides';
import { SlidePanel } from '../ui/SlidePanel';
import {
  buildNavaidNarrative,
  soundingNowFeet,
  type NavaidKind,
  type NavaidProperties,
} from '../utils/navaidNarrative';

export interface NavaidFeature {
  kind: NavaidKind;
  properties: NavaidProperties;
  lng: number;
  lat: number;
}

interface Props {
  feature: NavaidFeature;
  onClose: () => void;
}

export function NavaidDetailPanel({ feature, onClose }: Props) {
  const narrative = buildNavaidNarrative(feature);
  const soundingNow = useSoundingNowLine(feature);

  return (
    <SlidePanel open onClose={onClose} labelledBy="navaid-detail-title">
      <article className="navaid-detail">
        <h2 id="navaid-detail-title" className="navaid-detail__title">
          {narrative.title}
        </h2>
        <p className="navaid-detail__kind">{narrative.kind}</p>
        {soundingNow && <p className="navaid-detail__now">{soundingNow}</p>}
        {narrative.light && <p className="navaid-detail__light">{narrative.light}</p>}
        {narrative.range && <p className="navaid-detail__range">{narrative.range}</p>}
        {narrative.position && <p className="navaid-detail__pos">{narrative.position}</p>}
      </article>
    </SlidePanel>
  );
}

// Computes the "About N ft right now (tide is +X ft)" line for soundings.
// Returns null for any other nav-mark kind so the panel skips it.
function useSoundingNowLine(feature: NavaidFeature): string | null {
  const self = useSelf();
  const now = useNow(5 * 60 * 1000);
  if (feature.kind !== 'soundg') return null;
  const meters = feature.properties.VALSOU;
  if (meters == null) return null;
  const pos = self?.position ?? FALLBACK_POS;
  const tideFt = tideHeightFt(now, pos);
  const nowFt = Math.round(soundingNowFeet(meters, tideFt));
  const tideLabel = tideFt >= 0 ? `+${tideFt.toFixed(1)}` : tideFt.toFixed(1);
  return `About ${nowFt} ft right now (tide is ${tideLabel} ft)`;
}
