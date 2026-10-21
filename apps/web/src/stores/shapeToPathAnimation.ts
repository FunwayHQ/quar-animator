/**
 * Converting an animated shape to a path: its size keyframes (width,
 * radius, corner radius…) have nothing to drive on a path, so they become
 * whole-shape keyframes — the outline the shape had at each keyframe time —
 * and the path morphs as the shape did.
 */

import type { EasingFunction, Node, PathPoint, Timeline } from '@quar/types';
import { getShapeOutlinePoints } from '@quar/core';
import {
  addKeyframe,
  applyAnimatedValues,
  createTrack,
  evaluateNodeAtFrame,
} from '@quar/animation';

/** The properties of a rectangle, ellipse or polygon that shape its outline. */
const GEOMETRY = /^(width|height|radiusX|radiusY|radius|innerRadius|sides|cornerRadius(\.\d+)?)$/;

export function shapeTracksToOutline(timeline: Timeline, node: Node): Timeline {
  const shapeTracks = timeline.tracks.filter(
    (track) => track.nodeId === node.id && GEOMETRY.test(track.property)
  );
  if (shapeTracks.length === 0) return timeline;

  const times = [
    ...new Set(shapeTracks.flatMap((track) => track.keyframes.map((kf) => kf.time))),
  ].sort((a, b) => a - b);
  const outline = createTrack<PathPoint[]>(node.id, 'points');
  for (const time of times) {
    const posed = applyAnimatedValues(node, evaluateNodeAtFrame(timeline, node.id, time));
    const points = getShapeOutlinePoints(posed)?.points;
    if (!points) continue;
    const easing: EasingFunction =
      shapeTracks.flatMap((track) => track.keyframes).find((kf) => kf.time === time)?.easing ??
      'linear';
    addKeyframe(outline, time, points, easing);
  }

  return {
    ...timeline,
    tracks: [
      ...timeline.tracks.filter((track) => !shapeTracks.includes(track)),
      ...(outline.keyframes.length > 0 ? [outline] : []),
    ],
  };
}
