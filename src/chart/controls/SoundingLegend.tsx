// On-chart key for spot-depth numbers. Separated from DepthLegend because
// contours and soundings are conceptually distinct — colors explain the
// lines, this panel explains the numbers scattered across the water.
//
// The on-chart numbers are tide-adjusted in real time (see
// soundingLabelExpressionForTide in marineStyle.ts), so the legend says
// "depth now" — no mental math required.

export function SoundingLegend() {
  return (
    <div
      className="chart-legend sounding-legend"
      role="group"
      aria-label="Spot depth key"
    >
      <span className="chart-legend__title">SPOT DEPTHS</span>
      <div className="sounding-legend__body">
        <span className="sounding-legend__sample" aria-hidden="true">
          12
        </span>
        <div className="sounding-legend__text">
          <span className="sounding-legend__primary">depth right now (ft)</span>
          <span className="sounding-legend__secondary">updates with the tide</span>
        </div>
      </div>
    </div>
  );
}
