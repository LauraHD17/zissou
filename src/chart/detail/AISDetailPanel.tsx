// Slide-up panel for a tapped AIS vessel. Mirrors the AIS list card content
// but adds a one-line headline narrative (from buildVesselNarrative) so the
// operator gets both the summary and the raw facts in one place.

import { useMemo } from 'react';
import { SlidePanel } from '../../ui/SlidePanel';
import { useSelf } from '../../signalk/useSignalK';
import type { Vessel } from '../../signalk/types';
import { buildVesselNarrative } from '../../utils/narrative';
import { isVesselStale } from '../../signalk/types';
import { computeThreatBand } from '../../utils/threat';
import { buildVhfScript } from '../../utils/vhfScript';
import { resolveBoatName, useUserPrefs } from '../../prefs/userPrefsStore';

interface Props {
  vessel: Vessel;
  onClose: () => void;
}

export function AISDetailPanel({ vessel, onClose }: Props) {
  const self = useSelf();
  const prefs = useUserPrefs();

  const { narrative, isStale, band } = useMemo(() => {
    const now = Date.now();
    const stale = isVesselStale(vessel, now);
    return {
      narrative: buildVesselNarrative(vessel, self, now),
      isStale: stale,
      band: computeThreatBand(vessel, self, stale),
    };
  }, [vessel, self]);

  const vhf = useMemo(
    () => buildVhfScript(vessel, self, resolveBoatName(prefs.boatName, self?.name)),
    [vessel, self, prefs.boatName],
  );

  const displayName =
    vessel.name ?? (vessel.mmsi ? `Unnamed vessel (MMSI ${vessel.mmsi})` : 'Unknown vessel');

  return (
    <SlidePanel open onClose={onClose} labelledBy="ais-detail-title">
      <article className={`ais-detail${isStale ? ' ais-detail--stale' : ''}`}>
        {band !== 'monitor' && <span className={`threat-pill threat-pill--${band}`}>{band}</span>}
        <h2 id="ais-detail-title" className="ais-detail__name">
          {displayName}
        </h2>
        <p className="ais-detail__location">{narrative.location}</p>
        {narrative.movement && <p className="ais-detail__movement">{narrative.movement}</p>}
        {narrative.qualifier && <p className="ais-detail__qualifier">{narrative.qualifier}</p>}
        <p className="ais-detail__raw">{narrative.rawFacts}</p>
        <section className="ais-detail__vhf" aria-label="Radio call script">
          <h3 className="ais-detail__vhf-title">Radio call — channel 16</h3>
          {vhf.lines.map((line) => (
            <p key={line} className="ais-detail__vhf-line">
              {line}
            </p>
          ))}
          {vhf.missingOwnName && (
            <p className="ais-detail__vhf-hint">Set your boat name in Settings.</p>
          )}
        </section>
      </article>
    </SlidePanel>
  );
}
