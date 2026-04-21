// Plain-language detail sheet for a tapped chart feature — nav-aid or spot
// sounding. Shape and dismissal mirror AISDetailPanel: both are bottom
// SlidePanels with focus trap / Escape / swipe-down / tap-outside already
// handled by the shared component. S-57 → English lives in navaidNarrative.ts.
//
// For spot soundings, the panel overrides the generic narrative with a
// tide-aware breakdown — title shows the CURRENT depth (matching what's
// painted on the chart), with the charted low-tide value + tide offset
// underneath for reference.

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
  const sounding = useSoundingParts(feature);

  // Sounding path: fully tide-aware, renders its own title + breakdown so
  // the chart number and the panel number always agree.
  if (sounding) {
    return (
      <SlidePanel open onClose={onClose} labelledBy="navaid-detail-title">
        <article className="navaid-detail">
          <h2 id="navaid-detail-title" className="navaid-detail__title">
            {sounding.nowFt} ft here right now
          </h2>
          <p className="navaid-detail__kind">Depth under your keel at this spot.</p>
          <p className="navaid-detail__breakdown">
            Charted low-tide depth: {sounding.lowFt} ft · tide is {sounding.tideLabel} ft
          </p>
          <p className="navaid-detail__pos">{sounding.position}</p>
        </article>
      </SlidePanel>
    );
  }

  const narrative = buildNavaidNarrative(feature);
  return (
    <SlidePanel open onClose={onClose} labelledBy="navaid-detail-title">
      <article className="navaid-detail">
        <h2 id="navaid-detail-title" className="navaid-detail__title">
          {narrative.title}
        </h2>
        <p className="navaid-detail__kind">{narrative.kind}</p>
        {narrative.light && <p className="navaid-detail__light">{narrative.light}</p>}
        {narrative.range && <p className="navaid-detail__range">{narrative.range}</p>}
        {narrative.position && <p className="navaid-detail__pos">{narrative.position}</p>}
      </article>
    </SlidePanel>
  );
}

interface SoundingParts {
  nowFt: number;
  lowFt: number;
  tideLabel: string;
  position: string;
}

/**
 * Collects everything the sounding panel needs: current-depth feet,
 * charted low-tide feet, formatted tide offset, and lat/lon. Returns
 * null for any non-sounding feature.
 */
function useSoundingParts(feature: NavaidFeature): SoundingParts | null {
  const self = useSelf();
  const now = useNow(5 * 60 * 1000);
  if (feature.kind !== 'soundg') return null;
  const meters = feature.properties.VALSOU ?? feature.properties.DEPTH;
  if (meters == null) return null;
  const pos = self?.position ?? FALLBACK_POS;
  const tideFt = tideHeightFt(now, pos);
  const nowFt = Math.round(soundingNowFeet(meters, tideFt));
  const lowFt = Math.round(meters * 3.28084);
  const tideLabel = tideFt >= 0 ? `+${tideFt.toFixed(1)}` : tideFt.toFixed(1);
  return {
    nowFt,
    lowFt,
    tideLabel,
    position: formatLatLonShort(feature.lat, feature.lng),
  };
}

function formatLatLonShort(lat: number, lng: number): string {
  const la = Math.abs(lat);
  const lo = Math.abs(lng);
  const laD = Math.floor(la);
  const laM = (la - laD) * 60;
  const loD = Math.floor(lo);
  const loM = (lo - loD) * 60;
  const laH = lat >= 0 ? 'N' : 'S';
  const loH = lng >= 0 ? 'E' : 'W';
  return `${laD}°${laM.toFixed(1)}′${laH} · ${loD}°${loM.toFixed(1)}′${loH}`;
}
