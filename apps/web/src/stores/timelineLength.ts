/**
 * The animation tools (motion presets, the Animation Sequence) lengthen the
 * timeline to fit the keyframes they write, as they lengthen the page's.
 * Working in an artboard, it's that artboard's timeline that has to fit them.
 */

import { withScopeDuration } from '@quar/animation';
import { inTimelineScope } from '@quar/core';
import type { ScopeLookup } from '@quar/core';
import type { Timeline } from '@quar/types';

interface InView {
  timeline: Timeline;
  timelineScope: string | null;
  timelineDuration: number;
}

/** The store's timeline fields once the tools made `written`, its length where it belongs. */
export function lengthenedToFit(
  state: InView,
  written: Timeline,
  sceneGraph: ScopeLookup
): { timeline: Timeline; timelineDuration: number } {
  const scope = state.timelineScope;
  if (scope === null) {
    return {
      timeline: written,
      timelineDuration: Math.max(state.timelineDuration, written.duration),
    };
  }
  const inScope = inTimelineScope(sceneGraph, scope);
  let last = -1;
  for (const track of written.tracks) {
    if (!inScope(track.nodeId)) continue;
    for (const keyframe of track.keyframes) last = Math.max(last, keyframe.time);
  }
  const length = Math.max(state.timelineDuration, Math.ceil(last) + 1);
  // The page's own length stays: the artboard's grows
  const timeline = withScopeDuration(
    { ...written, duration: state.timeline.duration },
    scope,
    length
  );
  return { timeline, timelineDuration: length };
}
