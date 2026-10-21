/**
 * Path Commands for Quar Animator
 * Edits to whole paths from the Edit menu: reversing, simplifying, joining
 * and cutting them, and the keyframes that have to follow.
 */

import type {
  Matrix3,
  PathNode,
  PathPoint,
  PathShape,
  PropertyTrack,
  Stroke,
  Timeline,
} from '@quar/types';
import {
  getAllPoints,
  getPathBounds,
  isPathShape,
  joinContours,
  reversePath,
  simplifyContour,
  transformContour,
  vec2,
} from '@quar/core';
import { generateId } from '@quar/animation';
import { pointPrefix, rewritePointTracks } from './vertexTracks';

/** Each of the path's contours the other way round (its handles swapped). */
export function reversedContours(node: PathNode): Pick<PathNode, 'points' | 'subpaths'> {
  return {
    points: reversePath(node.points),
    subpaths: node.subpaths?.map((contour) => reversePath(contour)),
  };
}

/**
 * The strokes an opened path needs to stay visible. Open paths aren't filled,
 * so one with no visible stroke gets `stroke` in the color of its fill.
 */
export function strokeForOpening(
  node: PathNode,
  stroke: Stroke
): Partial<Pick<PathNode, 'strokes'>> {
  if (node.strokes.some((s) => s.visible && s.width > 0)) return {};
  const fill = node.fills.find((f) => f.visible && f.type === 'solid' && f.color);
  return { strokes: [{ ...stroke, color: fill?.color ? { ...fill.color } : { ...stroke.color } }] };
}

/** handleIn ↔ handleOut, the rest of a point property as it is. */
function swapHandle(rest: string): string {
  if (rest.startsWith('handleIn')) return `handleOut${rest.slice('handleIn'.length)}`;
  if (rest.startsWith('handleOut')) return `handleIn${rest.slice('handleOut'.length)}`;
  return rest;
}

/** The path's point keyframes following it being reversed (reversedContours). */
export function reversedTracks(timeline: Timeline, node: PathNode): Timeline {
  const lengths = [node.points.length, ...(node.subpaths ?? []).map((c) => c.length)];
  return rewritePointTracks(
    timeline,
    node.id,
    (contour, index, rest) =>
      contour < lengths.length && index < lengths[contour]!
        ? `${pointPrefix(contour, lengths[contour]! - 1 - index)}.${swapHandle(rest)}`
        : null,
    (contours) => contours.map((contour) => reversePath(contour))
  );
}

/**
 * The path's Shape keyframes once it's opened or closed: each records it, so
 * it tweens as the path now is. An older keyframe of the main contour
 * becomes the whole shape, with the path's holes.
 */
export function closedShapeTracks(timeline: Timeline, node: PathNode, closed: boolean): Timeline {
  let changed = false;
  const tracks = timeline.tracks.map((track) => {
    if (track.nodeId !== node.id || track.property !== 'points') return track;
    changed = true;
    return {
      ...track,
      keyframes: track.keyframes.map((keyframe) => {
        if (isPathShape(keyframe.value))
          return { ...keyframe, value: { ...keyframe.value, closed } };
        if (!Array.isArray(keyframe.value)) return keyframe;
        const shape: PathShape = { points: keyframe.value as PathPoint[], closed };
        if (node.subpaths && node.subpaths.length > 0)
          shape.subpaths = structuredClone(node.subpaths);
        return { ...keyframe, value: shape };
      }),
    };
  });
  return changed ? { ...timeline, tracks } : timeline;
}

/** Whether any of the path's points are animated (per point, or as a whole shape). */
export function hasPointAnimation(timeline: Timeline, nodeId: string): boolean {
  return timeline.tracks.some(
    (track) =>
      track.nodeId === nodeId &&
      track.keyframes.length > 0 &&
      (track.property === 'points' || /^(points|subpaths)\./.test(track.property))
  );
}

/**
 * The path's contours simplified (simplifyContour), within 0.4% of its
 * size; null when that takes no points away.
 */
export function simplifiedContours(node: PathNode): Pick<PathNode, 'points' | 'subpaths'> | null {
  const bounds = getPathBounds(getAllPoints(node), node.closed);
  if (!bounds) return null;
  const tolerance = Math.max(0.25, Math.hypot(bounds.width, bounds.height) * 0.004);
  const points = simplifyContour(node.points, node.closed, tolerance);
  const subpaths = node.subpaths?.map((contour) => simplifyContour(contour, true, tolerance));
  const before = getAllPoints(node).length;
  const after = points.length + (subpaths ?? []).reduce((sum, c) => sum + c.length, 0);
  return after < before ? { points, subpaths } : null;
}

/** Ends closer than this (in the path's units) become one point when joined. */
export const JOIN_TOLERANCE = 0.5;

/** An open contour closed: its ends become one point if they meet. */
export function closedContour(points: PathPoint[]): PathPoint[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 3 || !first || !last) return points;
  if (vec2.distance(first.position, last.position) > JOIN_TOLERANCE) return points;
  return [{ ...first, handleIn: last.handleIn, type: 'corner' }, ...points.slice(1, -1)];
}

/**
 * Open paths joined into `base`: each time the nearest pair of ends meets
 * (contours turned round as needed), the others' points brought into base's
 * space by `toBase`. Their other contours come along.
 */
export function joinedContours(
  base: PathNode,
  others: Array<{ node: PathNode; toBase: Matrix3 }>
): Pick<PathNode, 'points' | 'subpaths'> {
  let main = base.points;
  const subpaths = [...(base.subpaths ?? [])];
  let rest = others.map(({ node, toBase }) => ({
    points: transformContour(node.points, toBase),
    subpaths: (node.subpaths ?? []).map((contour) => transformContour(contour, toBase)),
  }));

  while (rest.length > 0) {
    let best = { index: 0, flipMain: false, flipOther: false, distance: Infinity };
    rest.forEach((other, index) => {
      for (const flipMain of [false, true]) {
        for (const flipOther of [false, true]) {
          const end = flipMain ? main[0] : main[main.length - 1];
          const start = flipOther ? other.points[other.points.length - 1] : other.points[0];
          if (!end || !start) continue;
          const distance = vec2.distance(end.position, start.position);
          if (distance < best.distance) best = { index, flipMain, flipOther, distance };
        }
      }
    });
    const other = rest[best.index]!;
    if (best.flipMain) main = reversePath(main);
    main = joinContours(
      main,
      best.flipOther ? reversePath(other.points) : other.points,
      JOIN_TOLERANCE
    );
    subpaths.push(...other.subpaths);
    rest = rest.filter((_, i) => i !== best.index);
  }
  return { points: main, subpaths: subpaths.length > 0 ? subpaths : undefined };
}

/**
 * A layer's tracks, for a copy of it (`copyId`): new ids, and keyframes an
 * Animation Sequence step generated become ordinary ones.
 */
export function tracksForCopy(timeline: Timeline, nodeId: string, copyId: string): PropertyTrack[] {
  return timeline.tracks
    .filter((track) => track.nodeId === nodeId)
    .map((track) => ({
      ...structuredClone(track),
      id: generateId('track'),
      nodeId: copyId,
      keyframes: track.keyframes.map(({ sequenceStepId: _step, ...keyframe }) => ({
        ...structuredClone(keyframe),
        id: generateId('kf'),
      })),
    }));
}
