/**
 * Path Editing for Quar Animator
 * Adding and deleting points of a path (all its contours, by flat index),
 * and finding the segment under the pointer — shared by Direct Selection
 * and the Pen.
 */

import type { Matrix3, PathNode, PathPoint, Vector2 } from '@quar/types';
import { mat3 } from '../math';
import { bezier } from './bezier';
import {
  getAbsoluteControlPoints,
  getAllPoints,
  getContourRange,
  getSubpathBoundaries,
  splitSegment,
} from './pathUtils';

/** A path's points as a node stores them: the main contour, then any others. */
export interface PathContours {
  points: PathPoint[];
  subpaths: PathPoint[][] | undefined;
}

function toContours(contours: PathPoint[][]): PathContours {
  return {
    points: contours[0] ?? [],
    subpaths: contours.length > 1 ? contours.slice(1) : undefined,
  };
}

/** The flat index of the point a segment (starting at segmentIndex) ends on. */
export function segmentEndIndex(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  segmentIndex: number
): number {
  const { start, end } = getContourRange(getSubpathBoundaries(node), segmentIndex);
  return start + ((segmentIndex - start + 1) % (end - start));
}

/**
 * The path with a point split into the segment that starts at segmentIndex,
 * t (the cubic's parameter) along it, keeping its shape; the new point is
 * at flat index segmentIndex + 1.
 */
export function insertPathPoint(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  segmentIndex: number,
  t: number
): PathContours {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const endIndex = segmentEndIndex(node, segmentIndex);
  const split = splitSegment(allPts[segmentIndex]!, allPts[endIndex]!, t);

  const newAll = [...allPts];
  newAll[segmentIndex] = split.start;
  newAll[endIndex] = split.end;
  newAll.splice(segmentIndex + 1, 0, split.point);

  // Rebuild the contours, the one split growing by a point
  const contours: PathPoint[][] = [];
  let offset = 0;
  for (let c = 0; c < boundaries.length - 1; c++) {
    const cStart = boundaries[c]!;
    const cEnd = boundaries[c + 1]!;
    const extra = cStart <= segmentIndex && segmentIndex < cEnd ? 1 : 0;
    contours.push(newAll.slice(offset, offset + (cEnd - cStart) + extra));
    offset += cEnd - cStart + extra;
  }
  return toContours(contours);
}

/**
 * The path with these points (flat indices) deleted, contours left empty
 * dropped; null when fewer than two points would remain.
 */
export function deletePathPoints(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  indices: Iterable<number>
): PathContours | null {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const deleted = new Set(indices);

  const contours: PathPoint[][] = [];
  for (let c = 0; c < boundaries.length - 1; c++) {
    const start = boundaries[c] ?? 0;
    const end = boundaries[c + 1] ?? allPts.length;
    const contour = allPts.slice(start, end).filter((_point, i) => !deleted.has(start + i));
    if (contour.length > 0) contours.push(contour);
  }
  const remaining = contours.reduce((sum, contour) => sum + contour.length, 0);
  return remaining < 2 ? null : toContours(contours);
}

/**
 * The segment of the path nearest `worldPos`, within `radius`, measured along
 * its curve (`toWorld` maps the path's local space to the world). Its t is
 * the cubic's parameter, the same in local space.
 */
export function nearestPathSegment(
  node: PathNode,
  toWorld: Matrix3,
  worldPos: Vector2,
  radius: number
): { segmentIndex: number; t: number; distance: number } | null {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const world = (v: Vector2) => mat3.transformPoint(toWorld, v);
  let best: { segmentIndex: number; t: number; distance: number } | null = null;

  for (let c = 0; c < boundaries.length - 1; c++) {
    const start = boundaries[c]!;
    const contourLength = boundaries[c + 1]! - start;
    const segments = node.closed ? contourLength : contourLength - 1;
    for (let local = 0; local < segments; local++) {
      const segmentIndex = start + local;
      const p1 = allPts[segmentIndex]!;
      const p2 = allPts[start + ((local + 1) % contourLength)]!;
      const { cp1, cp2 } = getAbsoluteControlPoints(p1, p2);
      // An affine map keeps a bezier a bezier, with the same t along it
      const nearest = bezier.nearestPoint(
        world(p1.position),
        world(cp1),
        world(cp2),
        world(p2.position),
        worldPos
      );
      if (nearest.distance < radius && (!best || nearest.distance < best.distance)) {
        best = { segmentIndex, t: nearest.t, distance: nearest.distance };
      }
    }
  }
  return best;
}

/** The point of the path (flat index) nearest `worldPos` within `radius`, or null. */
export function nearestPathPoint(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  toWorld: Matrix3,
  worldPos: Vector2,
  radius: number
): number | null {
  let best: number | null = null;
  let bestDistance = radius;
  getAllPoints(node).forEach((point, index) => {
    const world = mat3.transformPoint(toWorld, point.position);
    const distance = Math.hypot(world.x - worldPos.x, world.y - worldPos.y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
