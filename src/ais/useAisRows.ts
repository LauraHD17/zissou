// Row-building logic for the AIS panel: distance/narrative/threat banding for
// vessels + in-range hazard waypoints, sorted by band then distance. Split
// from AISList so the data shaping is separate from presentation — when real
// CPA/TCPA lands, this file and threat.ts change; the views don't.

import { useMemo } from 'react';
import { isVesselStale } from '../signalk/types';
import type { Vessel } from '../signalk/types';
import { useAISTargets, useSelf } from '../signalk/useSignalK';
import type { SavedWaypoint } from '../types/nav';
import { useWaypoints } from '../waypoints/waypointStore';
import { useNowMs } from '../utils/clock';
import { haversineNm, isPlausiblePosition } from '../utils/geometry';
import { buildHazardNarrative, buildVesselNarrative } from '../utils/narrative';
import { computeHazardThreatBand, computeThreatBand, type ThreatBand } from '../utils/threat';

export type FilterMode = 'all' | 'active';

export interface VesselRow {
  kind: 'vessel';
  vessel: Vessel;
  distanceNm: number | null;
  narrative: ReturnType<typeof buildVesselNarrative>;
  isStale: boolean;
  hasValidPosition: boolean;
  threatBand: ThreatBand;
}

export interface HazardRow {
  kind: 'hazard';
  waypoint: SavedWaypoint;
  distanceNm: number;
  narrative: ReturnType<typeof buildHazardNarrative>;
  threatBand: ThreatBand;
}

export type Row = VesselRow | HazardRow;

const BAND_ORDER: Record<ThreatBand, number> = { danger: 0, caution: 1, monitor: 2 };

export function useAisRows(filter: FilterMode): { visibleRows: Row[]; hiddenCount: number } {
  const targets = useAISTargets();
  const waypoints = useWaypoints();
  const self = useSelf();
  const now = useNowMs(5000);

  // Geometry + narrative are stable on (targets, self) — `now` only affects
  // staleness, which we overlay below. This keeps SignalK ticks from
  // re-running haversine/buildNarrative for every vessel every 5 s.
  const baseVesselRows = useMemo(() => {
    const selfPos = self?.position;
    return targets.map((v) => {
      const hasValidPosition = isPlausiblePosition(v.position);
      return {
        vessel: v,
        distanceNm:
          selfPos && hasValidPosition && v.position ? haversineNm(selfPos, v.position) : null,
        hasValidPosition,
      };
    });
  }, [targets, self]);

  const vesselRows = useMemo<VesselRow[]>(() => {
    return baseVesselRows.map(({ vessel, distanceNm, hasValidPosition }): VesselRow => {
      const isStale = isVesselStale(vessel, now);
      return {
        kind: 'vessel',
        vessel,
        distanceNm,
        hasValidPosition,
        isStale,
        narrative: buildVesselNarrative(vessel, self, now),
        threatBand: computeThreatBand(vessel, self, isStale),
      };
    });
  }, [baseVesselRows, self, now]);

  // Hazard waypoints within range get injected as rows. Banding is
  // distance-only (see threat.ts) so list order stays stable as own-ship
  // turns — the alarm watcher handles the heading-aware part.
  const hazardRows = useMemo<HazardRow[]>(() => {
    const rows: HazardRow[] = [];
    for (const wp of waypoints) {
      if (wp.category !== 'hazard') continue;
      const hazPos = { latitude: wp.lat, longitude: wp.lon };
      const result = computeHazardThreatBand(hazPos, self);
      if (!result) continue;
      rows.push({
        kind: 'hazard',
        waypoint: wp,
        distanceNm: result.distanceNm,
        narrative: buildHazardNarrative(wp, self),
        threatBand: result.band,
      });
    }
    return rows;
  }, [waypoints, self]);

  const allRows = useMemo<Row[]>(() => {
    return [...vesselRows, ...hazardRows].sort((a, b) => {
      const bandDiff = BAND_ORDER[a.threatBand] - BAND_ORDER[b.threatBand];
      if (bandDiff !== 0) return bandDiff;
      const da = a.distanceNm;
      const db = b.distanceNm;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }, [vesselRows, hazardRows]);

  const visibleRows = filter === 'all' ? allRows : allRows.filter(isActive);
  return { visibleRows, hiddenCount: allRows.length - visibleRows.length };
}

function isActive(row: Row): boolean {
  // Hazards are always "active" — static objects with known position.
  if (row.kind === 'hazard') return true;
  if (row.isStale) return false;
  if (!row.hasValidPosition) return false;
  return true;
}
