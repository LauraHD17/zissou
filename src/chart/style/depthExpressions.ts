// Tide-aware depth contour + spot-sounding MapLibre expressions. Pure
// data→expression transforms (no map lifecycle) plus applyTideToDepthContours,
// which repoints the two live layers when the tide refreshes. Extracted from
// marineStyle.ts so the depth math stays testable and separate from the NOAA
// layer wiring.

import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import { COLORS } from './styleTokens';
import { feetToMeters, M_TO_FT } from '../../utils/units';

export const DEPTH_BREAK_SHALLOW_M = 1.83; // meters (6 ft) — VALDCO breakpoint
export const DEPTH_BREAK_MODERATE_M = 6.1; // meters (20 ft) — VALDCO breakpoint

const DEPTH_BREAK_SHALLOW = DEPTH_BREAK_SHALLOW_M;
const DEPTH_BREAK_MODERATE = DEPTH_BREAK_MODERATE_M;

export const DEPTH_COLOR_EXPRESSION: DataDrivenPropertyValueSpecification<string> =
  depthColorExpressionForTide(0);

/**
 * Depth-contour color expression shifted by the current tide height.
 * Soundings (VALDCO) are referenced to mean low water — effective depth at a
 * contour = VALDCO + tide above MLW. So "shallow" now means VALDCO + tide <
 * shallow-threshold, i.e., VALDCO < shallow-threshold − tide. We shift the
 * step breaks down by the current tide in meters. Never negative.
 */
export function depthColorExpressionForTide(
  tideFt: number,
): DataDrivenPropertyValueSpecification<string> {
  const tideM = feetToMeters(tideFt);
  const shallowBreak = Math.max(0.01, DEPTH_BREAK_SHALLOW - tideM);
  const moderateBreak = Math.max(shallowBreak + 0.01, DEPTH_BREAK_MODERATE - tideM);
  return [
    'step',
    ['to-number', ['get', 'VALDCO']],
    COLORS.depthShallow,
    shallowBreak,
    COLORS.depthModerate,
    moderateBreak,
    COLORS.depthDeep,
  ] as unknown as ExpressionSpecification;
}

/**
 * Text-field expression for spot-depth labels. Adds the current tide
 * height to the charted (low-tide) value so the on-chart number is the
 * depth an operator will see under their keel RIGHT NOW — no mental math
 * at the helm. Gets recomputed on every tide-refresh tick by
 * applyTideToDepthContours.
 */
export function soundingLabelExpressionForTide(
  tideFt: number,
): DataDrivenPropertyValueSpecification<string> {
  return [
    'to-string',
    [
      'round',
      [
        '+',
        ['*', ['to-number', ['coalesce', ['get', 'VALSOU'], ['get', 'DEPTH']]], M_TO_FT],
        tideFt,
      ],
    ],
  ] as unknown as DataDrivenPropertyValueSpecification<string>;
}

export function applyTideToDepthContours(map: MapLibreMap, tideFt: number): void {
  const contourExpr = depthColorExpressionForTide(tideFt);
  if (map.getLayer('noaa-depth-contour')) {
    map.setPaintProperty('noaa-depth-contour', 'line-color', contourExpr);
  }
  const soundingLabel = soundingLabelExpressionForTide(tideFt);
  if (map.getLayer('noaa-soundg-label')) {
    map.setLayoutProperty('noaa-soundg-label', 'text-field', soundingLabel);
  }
}
