// Renderless host for every app-level background concern. Mounting these
// here instead of in App keeps their re-renders (GPS ticks, 1 Hz alarm
// evaluation, weather polls) from cascading through the whole layout tree,
// and mounting the safety watches here instead of inside ChartCanvas means
// they keep running no matter which view is showing or whether the lazy
// chart bundle has loaded.

import { useApplyTheme } from './theme/useTheme';
import { useAudioPriming } from './alarm/useAlarmAudio';
import { useBreadcrumbRecorder } from './breadcrumbs/useBreadcrumbRecorder';
import { useCruisingSpeedRecorder } from './prefs/useCruisingSpeedRecorder';
import { useAnchorageDryingAlert } from './safety/useAnchorageDryingAlert';
import { useWeatherAutoFetch } from './weather/useWeatherAutoFetch';
import { useTideRefresh } from './utils/useTideRefresh';
import { useAnchorDragWatch } from './anchor/useAnchorDragWatch';
import { useHazardProximityWatch } from './waypoints/useHazardProximityWatch';
import { useInternetAis } from './ais/useInternetAis';

export function AppServices() {
  useApplyTheme();
  useAudioPriming();
  useBreadcrumbRecorder();
  useCruisingSpeedRecorder();
  useWeatherAutoFetch();
  useTideRefresh();
  useInternetAis();
  // Safety watches — always on, independent of the chart.
  useAnchorDragWatch();
  useHazardProximityWatch();
  useAnchorageDryingAlert();
  return null;
}
