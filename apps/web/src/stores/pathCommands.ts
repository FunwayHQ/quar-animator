/**
 * Path Commands for Quar Animator
 * Edits to whole paths from the Edit menu: reversing their direction, and
 * the keyframes that have to follow.
 */

import type { PathNode, PathPoint, Timeline } from '@quar/types';
import { reversePath } from '@quar/core';
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
