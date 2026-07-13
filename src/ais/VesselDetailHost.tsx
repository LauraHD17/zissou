// Renders the AIS detail panel for whichever vessel is selected (list row or
// chart marker). Two layers so the app root never re-renders on AIS ticks:
// the outer component subscribes only to the selection store; the inner one
// subscribes to targets and resolves the live vessel by context.

import { useEffect } from 'react';
import { useAISTargets } from '../signalk/useSignalK';
import { AISDetailPanel } from '../chart/detail/AISDetailPanel';
import { clearVesselSelection, useSelectedVesselContext } from './vesselSelectionStore';

export function VesselDetailHost() {
  const context = useSelectedVesselContext();
  if (!context) return null;
  return <SelectedVesselPanel context={context} />;
}

function SelectedVesselPanel({ context }: { context: string }) {
  const targets = useAISTargets();
  const vessel = targets.find((v) => v.context === context);

  // Vessel evicted (silent >30 min sweep) while its panel was open — the
  // data is gone, so the panel goes with it rather than freezing stale info.
  useEffect(() => {
    if (!vessel) clearVesselSelection();
  }, [vessel]);

  if (!vessel) return null;
  return <AISDetailPanel vessel={vessel} onClose={clearVesselSelection} />;
}
