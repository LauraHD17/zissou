// Slide-up panel for a tapped AIS vessel. Mirrors the AIS list card content
// but adds a one-line headline narrative (from buildVesselNarrative) so the
// operator gets both the summary and the raw facts in one place.

import { useMemo } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { useSelf } from '../signalk/useSignalK';
import type { Vessel } from '../signalk/types';
import { buildVesselNarrative } from '../utils/narrative';
import { AIS_STALE_MS } from '../signalk/types';
import { computeThreatBand } from '../utils/threat';

interface Props {
  vessel: Vessel;
  onClose: () => void;
}

export function AISDetailPanel({ vessel, onClose }: Props) {
  const self = useSelf();

  const { narrative, isStale, band } = useMemo(() => {
    const now = Date.now();
    const stale = now - vessel.lastUpdated > AIS_STALE_MS;
    return {
      narrative: buildVesselNarrative(vessel, self, now),
      isStale: stale,
      band: computeThreatBand(vessel, self, stale),
    };
  }, [vessel, self]);

  const displayName = vessel.name ?? (vessel.mmsi ? `Unnamed vessel (MMSI ${vessel.mmsi})` : 'Unknown vessel');

  return (
    <SlidePanel open onClose={onClose} labelledBy="ais-detail-title">
      <article className={`ais-detail${isStale ? ' ais-detail--stale' : ''}`}>
        {band !== 'monitor' && (
          <span className={`threat-pill threat-pill--${band}`}>{band}</span>
        )}
        <h2 id="ais-detail-title" className="ais-detail__name">{displayName}</h2>
        <p className="ais-detail__location">{narrative.location}</p>
        {narrative.movement && (
          <p className="ais-detail__movement">{narrative.movement}</p>
        )}
        {narrative.qualifier && (
          <p className="ais-detail__qualifier">{narrative.qualifier}</p>
        )}
        <p className="ais-detail__raw">{narrative.rawFacts}</p>
      </article>
    </SlidePanel>
  );
}
