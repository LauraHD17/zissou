// Bottom-center glance pill for the tap-for-depth story. Purely
// presentational — useDepthTaps owns the tap logic and honesty rules.
// Bottom-center is free because RouteBuildPill only renders while a pick
// mode is armed, and depth taps are suppressed while armed.

import { DismissButton } from '../../ui/DismissButton';
import { formatLatLon } from '../../utils/navaidNarrative';
import type { DepthTapResult } from '../hooks/useDepthTaps';

interface Props {
  result: DepthTapResult;
  onDismiss: () => void;
}

export function DepthStoryPill({ result, onDismiss }: Props) {
  return (
    <div className="depth-story-pill" role="status">
      <DismissButton onClick={onDismiss} label="Hide depth reading" />
      <div className="depth-story-pill__body">
        <span className="depth-story-pill__headline">{result.story.headline}</span>
        <span className="depth-story-pill__detail">{result.story.detail}</span>
        <span className="depth-story-pill__pos">{formatLatLon(result.lat, result.lng)}</span>
      </div>
    </div>
  );
}
