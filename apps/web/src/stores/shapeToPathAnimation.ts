/**
 * Converting an animated shape to a path: its size keyframes (width,
 * radius, corner radius…) have nothing to drive on a path, so they become
 * whole-shape keyframes — the outline the shape had at each keyframe time —
 * and the path morphs as the shape did.
 */

import type { EasingFunction, Node, PathPoint, PathShape, Timeline } from '@quar/types';
import { getShapeOutlinePoints } from '@quar/core';
import {
  addKeyframe,
  applyAnimatedValues,
  createTrack,
  evaluateNodeAtFrame,
} from '@quar/animation';

/** The properties of a rectangle, ellipse or polygon that shape its outline. */
export const SHAPE_GEOMETRY =
  /^(width|height|radiusX|radiusY|radius|innerRadius|sides|cornerRadius(\.\d+)?)$/;

/**
 * A sharp corner as the arc of radius 0 a rounded one shrinks to: two points
 * on the corner, with handles of no length, where a rounded corner has its
 * two arc ends.
 */
function zeroArc(corner: PathPoint): PathPoint[] {
  const { x, y } = corner.position;
  return [
    { position: { x, y }, handleIn: null, handleOut: { x: 0, y: 0 }, type: 'smooth' },
    { position: { x, y }, handleIn: { x: 0, y: 0 }, handleOut: null, type: 'smooth' },
  ];
}

/**
 * Which corners are rounded at any of these poses: each rectangle corner on
 * its own, a polygon's or star's all together. Null for an ellipse.
 */
function roundedCorners(poses: Node[]): boolean[] | null {
  const first = poses[0];
  if (first?.type === 'rectangle') {
    return [0, 1, 2, 3].map((corner) =>
      poses.some((pose) => pose.type === 'rectangle' && (pose.cornerRadius[corner] ?? 0) > 0)
    );
  }
  if (first?.type === 'polygon') {
    return [poses.some((pose) => pose.type === 'polygon' && (pose.cornerRadius ?? 0) > 0)];
  }
  return null;
}

/**
 * The shape's outline at a pose, its corners rounded at some other pose drawn
 * as arcs even where they're sharp here. Every outline of one shape then has
 * the same points, and the morph between them tweens each corner's rounding
 * as the shape did (a 4-point outline matched to an 8-point one went
 * lopsided, points added wherever the matching found room).
 */
function outlineAt(pose: Node, rounded: boolean[] | null): PathPoint[] | undefined {
  const points = getShapeOutlinePoints(pose)?.points;
  if (!points || !rounded) return points;
  if (pose.type === 'rectangle') {
    // Its corners in order, top left first: two points if rounded, else one
    const out: PathPoint[] = [];
    let i = 0;
    pose.cornerRadius.forEach((radius, corner) => {
      if (radius > 0) {
        out.push(...points.slice(i, i + 2));
        i += 2;
      } else {
        const point = points[i++];
        if (point) out.push(...(rounded[corner] ? zeroArc(point) : [point]));
      }
    });
    return out;
  }
  if (pose.type === 'polygon' && rounded[0] && !((pose.cornerRadius ?? 0) > 0)) {
    return points.flatMap(zeroArc);
  }
  return points;
}

export function shapeTracksToOutline(timeline: Timeline, node: Node): Timeline {
  const shapeTracks = timeline.tracks.filter(
    (track) => track.nodeId === node.id && SHAPE_GEOMETRY.test(track.property)
  );
  if (shapeTracks.length === 0) return timeline;

  const times = [
    ...new Set(shapeTracks.flatMap((track) => track.keyframes.map((kf) => kf.time))),
  ].sort((a, b) => a - b);
  const poses = times.map((time) =>
    applyAnimatedValues(node, evaluateNodeAtFrame(timeline, node.id, time))
  );
  const rounded = roundedCorners(poses);
  const outline = createTrack<PathShape>(node.id, 'points');
  times.forEach((time, t) => {
    const posed = poses[t];
    const points = posed && outlineAt(posed, rounded);
    if (!points) return;
    const easing: EasingFunction =
      shapeTracks.flatMap((track) => track.keyframes).find((kf) => kf.time === time)?.easing ??
      'linear';
    addKeyframe(outline, time, { points, closed: true }, easing);
  });

  return {
    ...timeline,
    tracks: [
      ...timeline.tracks.filter((track) => !shapeTracks.includes(track)),
      ...(outline.keyframes.length > 0 ? [outline] : []),
    ],
  };
}
