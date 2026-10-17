import type { Keyframe, Timeline } from '@quar/types';
import type { KeyframeState } from '../components/common/KeyframeIndicator';
import { findTrack } from '@quar/animation';

/**
 * Pure function to determine the keyframe state for a property at a given frame.
 * - 'none': no timeline or no track for this property
 * - 'active': keyframe exists at the current frame
 * - 'inactive': track has keyframes, but none at the current frame
 */
export function getKeyframeState(
  timeline: Timeline | null,
  nodeId: string,
  property: string,
  currentFrame: number
): KeyframeState {
  if (!timeline) return 'none';
  const track = findTrack(timeline, nodeId, property);
  if (!track || track.keyframes.length === 0) return 'none';
  const hasAtFrame = track.keyframes.some((kf: Keyframe) => kf.time === currentFrame);
  if (hasAtFrame) return 'active';
  return 'inactive';
}

/**
 * State of a property keyed as a group (X and Y, width and height, the four
 * corners): active when any of them is keyed at this frame, inactive when any
 * is animated.
 */
export function getGroupKeyframeState(
  timeline: Timeline | null,
  nodeId: string,
  properties: string[],
  currentFrame: number
): KeyframeState {
  const states = properties.map((property) =>
    getKeyframeState(timeline, nodeId, property, currentFrame)
  );
  if (states.includes('active')) return 'active';
  if (states.includes('inactive')) return 'inactive';
  return 'none';
}
