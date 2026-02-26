/**
 * Shape Tweening — Path Interpolation for Quar Animator
 *
 * Morphs between different path shapes by normalizing point counts,
 * finding optimal correspondence, and lerping positions/handles.
 */

import type { PathPoint, Vector2 } from '@quar/types';
import { bezier } from '../path/bezier';
import {
  forEachSegment,
  getAbsoluteControlPoints,
  getSegmentLength,
  clonePathPoint,
} from '../path/pathUtils';

// ============================================================================
// Types
// ============================================================================

export interface ShapeTweenData {
  sourceNormalized: PathPoint[];
  targetNormalized: PathPoint[];
}

// ============================================================================
// Arc Length Computation
// ============================================================================

/**
 * Compute arc lengths for each segment in a path.
 * Returns an array of lengths, one per segment.
 */
export function computeSegmentArcLengths(points: PathPoint[], closed: boolean): number[] {
  const lengths: number[] = [];
  forEachSegment(points, closed, (p0, p1) => {
    lengths.push(getSegmentLength(p0, p1));
  });
  return lengths;
}

// ============================================================================
// Segment Subdivision
// ============================================================================

/**
 * Subdivide a bezier segment between two PathPoints into `count` equal
 * arc-length sub-segments. Returns `count + 1` points including both endpoints.
 *
 * New interior points are smooth with handles derived from the de Casteljau split.
 */
export function subdivideSegmentPoints(p0: PathPoint, p1: PathPoint, count: number): PathPoint[] {
  if (count <= 1) {
    return [clonePathPoint(p0), clonePathPoint(p1)];
  }

  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
  const startPos = p0.position;
  const endPos = p1.position;

  // Compute total arc length
  const totalLength = bezier.cubicLength(startPos, cp1, cp2, endPos);
  if (totalLength < 1e-6) {
    // Degenerate segment — just clone endpoints with duplicates
    const result: PathPoint[] = [clonePathPoint(p0)];
    for (let i = 1; i < count; i++) {
      result.push(clonePathPoint(p0));
    }
    result.push(clonePathPoint(p1));
    return result;
  }

  // Find t values for equal arc-length spacing via binary search
  const tValues: number[] = [];
  for (let i = 1; i < count; i++) {
    const targetLength = (i / count) * totalLength;
    tValues.push(findTForArcLength(startPos, cp1, cp2, endPos, targetLength, totalLength));
  }

  // Split the curve at each t value and extract points with handles
  const result: PathPoint[] = [clonePathPoint(p0)];

  // Use splitAtMultiple to get all sub-curves
  const subCurves = bezier.splitAtMultiple(startPos, cp1, cp2, endPos, tValues);

  for (let i = 0; i < subCurves.length; i++) {
    const curve = subCurves[i]!;

    // Update the handleOut of the previous point
    const prevPoint = result[result.length - 1]!;
    const handleOutAbsolute = curve.p1;
    prevPoint.handleOut = {
      x: handleOutAbsolute.x - prevPoint.position.x,
      y: handleOutAbsolute.y - prevPoint.position.y,
    };
    prevPoint.type = 'smooth';

    if (i < subCurves.length - 1) {
      // Interior point — p3 is the split point
      const handleInAbsolute = curve.p2;
      const newPoint: PathPoint = {
        position: { x: curve.p3.x, y: curve.p3.y },
        handleIn: {
          x: handleInAbsolute.x - curve.p3.x,
          y: handleInAbsolute.y - curve.p3.y,
        },
        handleOut: null, // will be set by next iteration
        type: 'smooth',
      };
      result.push(newPoint);
    } else {
      // Last sub-curve — update the endpoint
      const endPoint = clonePathPoint(p1);
      const handleInAbsolute = curve.p2;
      endPoint.handleIn = {
        x: handleInAbsolute.x - endPoint.position.x,
        y: handleInAbsolute.y - endPoint.position.y,
      };
      endPoint.type = 'smooth';
      result.push(endPoint);
    }
  }

  return result;
}

/**
 * Find parameter t for a given arc length along a cubic bezier using binary search.
 */
function findTForArcLength(
  p0: Vector2,
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  targetLength: number,
  _totalLength: number
): number {
  let lo = 0;
  let hi = 1;

  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    const [left] = bezier.subdivide(p0, p1, p2, p3, mid);
    const len = bezier.cubicLength(left.p0, left.p1, left.p2, left.p3);

    if (len < targetLength) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

// ============================================================================
// Point Count Normalization
// ============================================================================

/**
 * Normalize two paths to have the same number of points by subdividing
 * segments on the shorter path. Extra points are distributed proportionally
 * to the longest segments.
 */
export function normalizePointCount(
  source: PathPoint[],
  target: PathPoint[],
  closedSource: boolean,
  closedTarget: boolean
): { source: PathPoint[]; target: PathPoint[] } {
  const srcCount = source.length;
  const tgtCount = target.length;

  if (srcCount === tgtCount) {
    return {
      source: source.map(clonePathPoint),
      target: target.map(clonePathPoint),
    };
  }

  if (srcCount === 0 || tgtCount === 0) {
    return {
      source: source.map(clonePathPoint),
      target: target.map(clonePathPoint),
    };
  }

  // Determine which is shorter and needs subdivision
  let shorter: PathPoint[];
  let longer: PathPoint[];
  let closedShorter: boolean;
  let sourceIsShorter: boolean;

  if (srcCount < tgtCount) {
    shorter = source;
    longer = target;
    closedShorter = closedSource;
    sourceIsShorter = true;
  } else {
    shorter = target;
    longer = source;
    closedShorter = closedTarget;
    sourceIsShorter = false;
  }

  const diff = longer.length - shorter.length;
  const subdivided = addPointsToPath(shorter, closedShorter, diff);

  if (sourceIsShorter) {
    return {
      source: subdivided,
      target: longer.map(clonePathPoint),
    };
  } else {
    return {
      source: longer.map(clonePathPoint),
      target: subdivided,
    };
  }
}

/**
 * Add `count` new points to a path by subdividing its longest segments.
 */
function addPointsToPath(points: PathPoint[], closed: boolean, count: number): PathPoint[] {
  if (points.length < 2 || count <= 0) {
    return points.map(clonePathPoint);
  }

  // Compute segment lengths
  const lengths = computeSegmentArcLengths(points, closed);
  const segmentCount = lengths.length;

  // Assign extra points to segments proportionally to their lengths
  const totalLength = lengths.reduce((s, l) => s + l, 0);
  const extras: number[] = Array.from<number>({ length: segmentCount }).fill(0);

  if (totalLength < 1e-6) {
    // All segments are degenerate; distribute evenly
    for (let i = 0; i < count; i++) {
      extras[i % segmentCount]!++;
    }
  } else {
    // Distribute proportionally, then assign remainders to longest segments
    const sorted = lengths.map((l, i) => ({ l, i })).sort((a, b) => b.l - a.l);

    let remaining = count;
    for (const { i, l } of sorted) {
      const share = Math.round((l / totalLength) * count);
      const assigned = Math.min(share, remaining);
      extras[i] = assigned;
      remaining -= assigned;
    }

    // Distribute any leftover to longest segments
    let idx = 0;
    while (remaining > 0) {
      extras[sorted[idx % sorted.length]!.i]!++;
      remaining--;
      idx++;
    }
  }

  // Build new path by subdividing each segment
  const result: PathPoint[] = [];

  for (let seg = 0; seg < segmentCount; seg++) {
    const p0 = points[seg]!;
    const p1 = points[(seg + 1) % points.length]!;
    const extraForSeg = extras[seg]!;

    if (extraForSeg === 0) {
      result.push(clonePathPoint(p0));
    } else {
      // subdivideSegmentPoints returns (extraForSeg + 1 + 1) points including both endpoints
      const subPoints = subdivideSegmentPoints(p0, p1, extraForSeg + 1);
      // Push all but the last (which is the next segment's start)
      for (let j = 0; j < subPoints.length - 1; j++) {
        result.push(subPoints[j]!);
      }
    }
  }

  // For open paths, push the last point
  if (!closed) {
    result.push(clonePathPoint(points[points.length - 1]!));
  }

  return result;
}

// ============================================================================
// Correspondence Finding
// ============================================================================

/**
 * Find the best rotational correspondence between two equal-length closed paths.
 * Returns the offset that minimizes the sum of squared distances.
 * For open paths, returns 0.
 */
export function findBestCorrespondence(
  source: PathPoint[],
  target: PathPoint[],
  closedSource: boolean,
  closedTarget: boolean
): number {
  if (!closedSource || !closedTarget) return 0;

  const n = source.length;
  if (n <= 1) return 0;

  // For large point counts, sample at stride to stay O(N * ~50)
  const maxTrials = Math.min(n, 50);
  const stride = Math.max(1, Math.floor(n / maxTrials));

  let bestOffset = 0;
  let bestCost = Infinity;

  for (let offset = 0; offset < n; offset += stride) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const sp = source[(i + offset) % n]!.position;
      const tp = target[i]!.position;
      const dx = sp.x - tp.x;
      const dy = sp.y - tp.y;
      cost += dx * dx + dy * dy;
    }

    if (cost < bestCost) {
      bestCost = cost;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

/**
 * Rotate a path's points by an offset (for correspondence matching).
 * Returns a deep-cloned, rotated array.
 */
export function applyCorrespondence(points: PathPoint[], offset: number): PathPoint[] {
  if (offset === 0 || points.length === 0) {
    return points.map(clonePathPoint);
  }

  const n = points.length;
  const safeOffset = ((offset % n) + n) % n;
  const result: PathPoint[] = [];

  for (let i = 0; i < n; i++) {
    result.push(clonePathPoint(points[(i + safeOffset) % n]!));
  }

  return result;
}

// ============================================================================
// Per-Point Interpolation
// ============================================================================

/**
 * Interpolate between two equal-length PathPoint arrays at parameter t.
 * - Positions and handles are lerped.
 * - Null handles are treated as {x:0, y:0}.
 * - Point type snaps at t=0.5.
 * - cornerRadius is lerped if both defined.
 */
export function interpolatePathPoints(a: PathPoint[], b: PathPoint[], t: number): PathPoint[] {
  const len = Math.min(a.length, b.length);
  const result: PathPoint[] = [];

  for (let i = 0; i < len; i++) {
    const pa = a[i]!;
    const pb = b[i]!;

    // Lerp position
    const position: Vector2 = {
      x: pa.position.x + (pb.position.x - pa.position.x) * t,
      y: pa.position.y + (pb.position.y - pa.position.y) * t,
    };

    // Lerp handles (null treated as {x:0, y:0})
    const haIn = pa.handleIn ?? { x: 0, y: 0 };
    const hbIn = pb.handleIn ?? { x: 0, y: 0 };
    const hIn: Vector2 = {
      x: haIn.x + (hbIn.x - haIn.x) * t,
      y: haIn.y + (hbIn.y - haIn.y) * t,
    };

    const haOut = pa.handleOut ?? { x: 0, y: 0 };
    const hbOut = pb.handleOut ?? { x: 0, y: 0 };
    const hOut: Vector2 = {
      x: haOut.x + (hbOut.x - haOut.x) * t,
      y: haOut.y + (hbOut.y - haOut.y) * t,
    };

    // Determine if handle is effectively null (both source and target are null)
    const handleIn =
      pa.handleIn === null && pb.handleIn === null
        ? null
        : Math.abs(hIn.x) < 1e-10 && Math.abs(hIn.y) < 1e-10
          ? null
          : hIn;
    const handleOut =
      pa.handleOut === null && pb.handleOut === null
        ? null
        : Math.abs(hOut.x) < 1e-10 && Math.abs(hOut.y) < 1e-10
          ? null
          : hOut;

    // Type snaps at t=0.5
    const type = t < 0.5 ? pa.type : pb.type;

    const point: PathPoint = { position, handleIn, handleOut, type };

    // Lerp cornerRadius if both defined
    if (pa.cornerRadius !== undefined && pb.cornerRadius !== undefined) {
      point.cornerRadius = pa.cornerRadius + (pb.cornerRadius - pa.cornerRadius) * t;
    } else if (pa.cornerRadius !== undefined && t < 0.5) {
      point.cornerRadius = pa.cornerRadius;
    } else if (pb.cornerRadius !== undefined && t >= 0.5) {
      point.cornerRadius = pb.cornerRadius;
    }

    result.push(point);
  }

  return result;
}

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Prepare a shape tween by normalizing point counts and finding optimal
 * correspondence. The result can be reused for multiple interpolation calls.
 */
export function prepareShapeTween(
  source: PathPoint[],
  target: PathPoint[],
  closedSource: boolean,
  closedTarget: boolean
): ShapeTweenData {
  // Step 1: Normalize point counts
  const normalized = normalizePointCount(source, target, closedSource, closedTarget);

  // Step 2: Find best correspondence (rotation offset)
  const offset = findBestCorrespondence(
    normalized.source,
    normalized.target,
    closedSource,
    closedTarget
  );

  // Step 3: Apply correspondence rotation to source
  const sourceRotated = applyCorrespondence(normalized.source, offset);

  return {
    sourceNormalized: sourceRotated,
    targetNormalized: normalized.target,
  };
}

/**
 * Interpolate a prepared shape tween at parameter t (0-1).
 */
export function interpolateShapeTween(tweenData: ShapeTweenData, t: number): PathPoint[] {
  return interpolatePathPoints(tweenData.sourceNormalized, tweenData.targetNormalized, t);
}
