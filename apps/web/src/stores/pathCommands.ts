/**
 * Path Commands for Quar Animator
 * Edits to whole paths from the Edit menu: reversing their direction, and
 * the keyframes that have to follow.
 */

import type { PathNode, PathPoint, Timeline } from '@quar/types';
import { getAllPoints, getPathBounds, reversePath, simplifyContour } from '@quar/core';
import { pointPrefix, rewritePointTracks } from './vertexTracks';

/** Each of the path's contours the other way round (its handles swapped). */
export function reversedContours(node: PathNode): Pick<PathNode, 'points' | 'subpaths'> {
  return {
    points: reversePath(node.points),
    subpaths: node.subpaths?.map((contour) => reversePath(contour)),
  };
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
    (points: PathPoint[]) => reversePath(points)
  );
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
