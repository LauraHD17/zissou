// Mode indicator + "Done" affordance for route-build mode. Appears while
// drop-pin is armed; hides automatically when the mode exits. Tapping
// "Done" disarms the picker.
//
// Not dismissible — it's a mode readout, not a notification. The parent
// (ChartCanvas) owns the armed state and renders this pill conditionally.

import { useActiveRoute } from '../../waypoints/routeStore';

interface Props {
  onDone: () => void;
}

export function RouteBuildPill({ onDone }: Props) {
  const route = useActiveRoute();
  const legCount = route?.waypoints.length ?? 0;
  const label =
    legCount === 0
      ? 'Tap chart to start route'
      : legCount === 1
        ? '1 pin placed'
        : `${legCount} pins placed`;

  return (
    <div
      className="route-build-pill"
      role="status"
      aria-live="polite"
      aria-label={`Route build mode. ${label}. Tap Done when finished.`}
    >
      <span className="route-build-pill__label">{label}</span>
      <button type="button" className="route-build-pill__done" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
