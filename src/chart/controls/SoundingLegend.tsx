// On-chart key for spot-depth numbers. Separated from DepthLegend because
// contours and soundings are conceptually distinct — colors explain the
// lines, this panel explains the numbers scattered across the water.
// Kept compact (one sample + two short sentences) so it doesn't crowd the
// chart at the cost of being helpful.
//
// Non-dismissible like its siblings — shares the `.chart-legend` base so
// any aesthetic tweak lands on all three legends at once.

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
          <span className="sounding-legend__primary">depth at low tide (ft)</span>
          <span className="sounding-legend__secondary">add tide for depth now</span>
        </div>
      </div>
    </div>
  );
}
