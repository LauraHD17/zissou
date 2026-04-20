// Derived view: dwells that don't already match a saved waypoint become
// "suggestions" the operator can save with one tap. Matching is geographic
// (within MATCH_RADIUS_NM) so moving the pin slightly doesn't re-suggest.

import { useMemo } from 'react';
import { useBreadcrumbs } from './breadcrumbStore';
import { useWaypoints } from '../waypoints/waypointStore';
import { detectDwells, tagDwell, type Dwell, type DwellTag } from './dwellDetector';
import { haversineNm } from '../utils/geometry';

const MATCH_RADIUS_NM = 0.05; // ~92 m

export interface SuggestedWaypoint extends Dwell {
  suggestedTag: DwellTag;
}

export function useSuggestedWaypoints(): SuggestedWaypoint[] {
  const crumbs = useBreadcrumbs();
  const saved = useWaypoints();

  return useMemo(() => {
    const dwells = detectDwells(crumbs);
    return (
      dwells
        .filter(
          (d) => !saved.some((w) => closeEnough(d.center, { latitude: w.lat, longitude: w.lon })),
        )
        .map((d) => ({ ...d, suggestedTag: tagDwell(d) }))
        // Newest first — operator reviews recent stops more often.
        .sort((a, b) => b.endedAt - a.endedAt)
    );
  }, [crumbs, saved]);
}

function closeEnough(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): boolean {
  return haversineNm(a, b) <= MATCH_RADIUS_NM;
}
