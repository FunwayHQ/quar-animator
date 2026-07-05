/**
 * Path Utilities for Quar Animator
 * Functions for working with PathPoint arrays and path tessellation
 */

import type { PathPoint, PathNode, Vector2, Rect } from '@quar/types';
import { vec2 } from '../math';
import { bezier } from './bezier';

/** Epsilon for geometry length/distance comparisons (e.g. degenerate edges, closing gaps) */
const GEOMETRY_EPSILON = 0.001;

// ============================================================================
// PathPoint Creation
// ============================================================================

/**
 * Create a corner PathPoint (no bezier handles)
 */
export function createCornerPoint(position: Vector2, cornerRadius?: number): PathPoint {
  const point: PathPoint = {
    position: { ...position },
    handleIn: null,
    handleOut: null,
    type: 'corner',
  };
  if (cornerRadius !== undefined && cornerRadius > 0) {
    point.cornerRadius = cornerRadius;
  }
  return point;
}

/**
 * Create a smooth PathPoint with symmetric handles
 */
export function createSmoothPoint(
  position: Vector2,
  handleOut: Vector2,
  handleIn?: Vector2
): PathPoint {
  const hOut = { ...handleOut };
  // If handleIn not provided, mirror handleOut
  const hIn = handleIn ? { ...handleIn } : { x: -hOut.x, y: -hOut.y };

  return {
    position: { ...position },
    handleIn: hIn,
    handleOut: hOut,
    type: 'smooth',
  };
}

/**
 * Create a symmetric PathPoint where handles are always mirrored
 */
export function createSymmetricPoint(position: Vector2, handleOut: Vector2): PathPoint {
  return {
    position: { ...position },
    handleIn: { x: -handleOut.x, y: -handleOut.y },
    handleOut: { ...handleOut },
    type: 'symmetric',
  };
}

/**
 * Clone a PathPoint
 */
export function clonePathPoint(point: PathPoint): PathPoint {
  const cloned: PathPoint = {
    position: { ...point.position },
    handleIn: point.handleIn ? { ...point.handleIn } : null,
    handleOut: point.handleOut ? { ...point.handleOut } : null,
    type: point.type,
  };
  if (point.cornerRadius !== undefined) {
    cloned.cornerRadius = point.cornerRadius;
  }
  return cloned;
}

/**
 * Center a PathNode's geometry at its AABB center.
 * Offsets all point positions so the center is at local (0,0),
 * sets transform.position to the AABB center, and anchor to (0.5, 0.5)
 * for correct rotation pivot. Handles are relative offsets — no change needed.
 * Returns the centering offset (the AABB center in original coords).
 */
export function centerPathNodeGeometry(node: PathNode): Vector2 {
  if (node.points.length === 0) return { x: 0, y: 0 };

  // Compute AABB of all point positions
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of node.points) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    if (p.position.y < minY) minY = p.position.y;
    if (p.position.y > maxY) maxY = p.position.y;
  }
  if (node.subpaths) {
    for (const sp of node.subpaths) {
      for (const p of sp) {
        if (p.position.x < minX) minX = p.position.x;
        if (p.position.x > maxX) maxX = p.position.x;
        if (p.position.y < minY) minY = p.position.y;
        if (p.position.y > maxY) maxY = p.position.y;
      }
    }
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Offset all point positions (handles are relative — unchanged)
  for (const p of node.points) {
    p.position.x -= cx;
    p.position.y -= cy;
  }
  if (node.subpaths) {
    for (const sp of node.subpaths) {
      for (const p of sp) {
        p.position.x -= cx;
        p.position.y -= cy;
      }
    }
  }

  // Update transform: position at AABB center, anchor for correct rotation pivot
  node.transform.position = { x: cx, y: cy };
  node.transform.anchor = { x: 0.5, y: 0.5 };

  return { x: cx, y: cy };
}

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Iterate over each segment in a path, calling the callback with the
 * start point, end point, and segment index.
 */
export function forEachSegment(
  points: PathPoint[],
  closed: boolean,
  callback: (p0: PathPoint, p1: PathPoint, index: number) => void
): void {
  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    callback(points[i]!, points[(i + 1) % points.length]!, i);
  }
}

/**
 * Compute the absolute control point positions for a bezier segment
 * between two PathPoints. Handles are stored as offsets from their anchor;
 * this returns absolute positions, falling back to the anchor when a handle
 * is null (straight line).
 */
export function getAbsoluteControlPoints(
  p0: PathPoint,
  p1: PathPoint
): { cp1: Vector2; cp2: Vector2 } {
  return {
    cp1: p0.handleOut ? vec2.add(p0.position, p0.handleOut) : p0.position,
    cp2: p1.handleIn ? vec2.add(p1.position, p1.handleIn) : p1.position,
  };
}

// ============================================================================
// Path Bounds
// ============================================================================

/**
 * Calculate the bounding box of a path
 */
export function getPathBounds(points: PathPoint[], closed: boolean): Rect | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      x: points[0]!.position.x,
      y: points[0]!.position.y,
      width: 0,
      height: 0,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  forEachSegment(points, closed, (p0, p1) => {
    const sb = getSegmentBounds(p0, p1);
    minX = Math.min(minX, sb.x);
    maxX = Math.max(maxX, sb.x + sb.width);
    minY = Math.min(minY, sb.y);
    maxY = Math.max(maxY, sb.y + sb.height);
  });

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

/**
 * Calculate bounds for a single path segment between two points
 */
export function getSegmentBounds(p0: PathPoint, p1: PathPoint): Rect {
  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
  return bezier.bounds(p0.position, cp1, cp2, p1.position);
}

// ============================================================================
// Path Tessellation
// ============================================================================

/**
 * Tessellate a path into vertices suitable for rendering
 * Returns a flat Float32Array of [x, y, x, y, ...] coordinates
 */
export function tessellatePathToVertices(
  points: PathPoint[],
  closed: boolean,
  tolerance: number = 1.0
): Float32Array {
  if (points.length === 0) return new Float32Array(0);
  if (points.length === 1) {
    return new Float32Array([points[0]!.position.x, points[0]!.position.y]);
  }

  const vertices: number[] = [];

  forEachSegment(points, closed, (p0, p1, index) => {
    const segmentPoints = tessellateSegment(p0, p1, tolerance);

    // Add segment points (skip first point for subsequent segments to avoid duplicates)
    const startIndex = index === 0 ? 0 : 1;
    for (let j = startIndex; j < segmentPoints.length; j++) {
      vertices.push(segmentPoints[j]!.x, segmentPoints[j]!.y);
    }
  });

  // For closed paths, remove the duplicate closing vertex that the closing
  // segment tessellation produces. Earcut assumes closed polygons and connects
  // last→first automatically; having a duplicate vertex creates a zero-length
  // edge that can produce incorrect triangulation (black artifacts).
  if (closed && vertices.length >= 6) {
    const firstX = vertices[0] as number;
    const firstY = vertices[1] as number;
    const lastX = vertices[vertices.length - 2] as number;
    const lastY = vertices[vertices.length - 1] as number;

    if (
      Math.abs(lastX - firstX) <= GEOMETRY_EPSILON &&
      Math.abs(lastY - firstY) <= GEOMETRY_EPSILON
    ) {
      vertices.splice(vertices.length - 2, 2);
    }
  }

  return new Float32Array(vertices);
}

/**
 * Tessellate a single segment between two PathPoints
 */
export function tessellateSegment(
  p0: PathPoint,
  p1: PathPoint,
  tolerance: number = 1.0
): Vector2[] {
  // If both handles are null (straight line), return just the endpoints
  if (!p0.handleOut && !p1.handleIn) {
    return [vec2.clone(p0.position), vec2.clone(p1.position)];
  }

  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
  return bezier.tessellate(p0.position, cp1, cp2, p1.position, tolerance);
}

/**
 * Get all tessellated points as an array of Vector2
 */
export function tessellatePathToPoints(
  points: PathPoint[],
  closed: boolean,
  tolerance: number = 1.0
): Vector2[] {
  const vertices = tessellatePathToVertices(points, closed, tolerance);
  const result: Vector2[] = [];

  for (let i = 0; i < vertices.length; i += 2) {
    result.push({ x: vertices[i]!, y: vertices[i + 1]! });
  }

  return result;
}

// ============================================================================
// Path Operations
// ============================================================================

/**
 * Reverse the direction of a path
 */
export function reversePath(points: PathPoint[]): PathPoint[] {
  return points
    .map((point) => {
      const newPoint = clonePathPoint(point);
      // Swap handles
      const tempHandle = newPoint.handleIn;
      newPoint.handleIn = newPoint.handleOut;
      newPoint.handleOut = tempHandle;
      return newPoint;
    })
    .reverse();
}

/**
 * Calculate the approximate length of a path
 */
export function getPathLength(points: PathPoint[], closed: boolean): number {
  if (points.length < 2) return 0;

  let totalLength = 0;
  forEachSegment(points, closed, (p0, p1) => {
    totalLength += getSegmentLength(p0, p1);
  });

  return totalLength;
}

/**
 * Calculate the length of a single segment
 */
export function getSegmentLength(p0: PathPoint, p1: PathPoint): number {
  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
  return bezier.cubicLength(p0.position, cp1, cp2, p1.position);
}

/**
 * Get a point on the path at a given t (0-1)
 */
export function getPointOnPath(points: PathPoint[], closed: boolean, t: number): Vector2 | null {
  if (points.length === 0) return null;
  if (points.length === 1) return vec2.clone(points[0]!.position);

  const segmentCount = closed ? points.length : points.length - 1;
  const totalSegments = segmentCount;

  // Clamp t
  t = Math.max(0, Math.min(1, t));

  // Find which segment t falls into
  const segmentIndex = Math.min(Math.floor(t * totalSegments), totalSegments - 1);
  const segmentT = t * totalSegments - segmentIndex;

  const p0 = points[segmentIndex]!;
  const p1 = points[(segmentIndex + 1) % points.length]!;
  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);

  return bezier.cubicPoint(p0.position, cp1, cp2, p1.position, segmentT);
}

/**
 * Get the tangent direction at a point on the path
 */
export function getTangentOnPath(points: PathPoint[], closed: boolean, t: number): Vector2 | null {
  if (points.length < 2) return null;

  const segmentCount = closed ? points.length : points.length - 1;
  const totalSegments = segmentCount;

  t = Math.max(0, Math.min(1, t));

  const segmentIndex = Math.min(Math.floor(t * totalSegments), totalSegments - 1);
  const segmentT = t * totalSegments - segmentIndex;

  const p0 = points[segmentIndex]!;
  const p1 = points[(segmentIndex + 1) % points.length]!;
  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);

  const derivative = bezier.cubicDerivative(p0.position, cp1, cp2, p1.position, segmentT);
  return vec2.normalize(derivative);
}

/**
 * Find the nearest point on a path to a given point
 */
export function getNearestPointOnPath(
  points: PathPoint[],
  closed: boolean,
  queryPoint: Vector2
): { point: Vector2; t: number; distance: number; segmentIndex: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      point: vec2.clone(points[0]!.position),
      t: 0,
      distance: vec2.distance(queryPoint, points[0]!.position),
      segmentIndex: 0,
    };
  }

  let bestResult = {
    point: vec2.clone(points[0]!.position),
    t: 0,
    distance: Infinity,
    segmentIndex: 0,
  };

  const segmentCount = closed ? points.length : points.length - 1;

  forEachSegment(points, closed, (p0, p1, i) => {
    const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
    const result = bezier.nearestPoint(p0.position, cp1, cp2, p1.position, queryPoint);

    if (result.distance < bestResult.distance) {
      bestResult = {
        point: result.point,
        t: (i + result.t) / segmentCount,
        distance: result.distance,
        segmentIndex: i,
      };
    }
  });

  return bestResult;
}

// ============================================================================
// Subpath Helpers (shared by DirectSelectionTool, PropertiesPanel, etc.)
// ============================================================================

/**
 * Merge node.points + node.subpaths[] into a single flat array.
 */
export function getAllPoints(node: { points: PathPoint[]; subpaths?: PathPoint[][] }): PathPoint[] {
  if (!node.subpaths || node.subpaths.length === 0) return node.points;
  const result: PathPoint[] = [...node.points];
  for (const sp of node.subpaths) result.push(...sp);
  return result;
}

/**
 * Return start indices of each contour: [0, points.length, points.length+subpaths[0].length, ...]
 */
export function getSubpathBoundaries(node: {
  points: PathPoint[];
  subpaths?: PathPoint[][];
}): number[] {
  const b = [0, node.points.length];
  if (node.subpaths) {
    for (const sp of node.subpaths) b.push(b[b.length - 1]! + sp.length);
  }
  return b;
}

/**
 * Split a flat array back into points + subpaths using the original node boundaries.
 */
export function setAllPoints(
  node: { points: PathPoint[]; subpaths?: PathPoint[][] },
  all: PathPoint[]
): { points: PathPoint[]; subpaths?: PathPoint[][] } {
  const b = getSubpathBoundaries(node);
  const points = all.slice(0, b[1]);
  const subpaths: PathPoint[][] = [];
  for (let i = 1; i < b.length - 1; i++) {
    subpaths.push(all.slice(b[i], b[i + 1]));
  }
  return { points, subpaths: subpaths.length ? subpaths : undefined };
}

/**
 * Find the contour range [start, end) for a given flat index.
 */
export function getContourRange(
  boundaries: number[],
  flatIndex: number
): { start: number; end: number } {
  for (let c = 0; c < boundaries.length - 1; c++) {
    if (flatIndex >= boundaries[c]! && flatIndex < boundaries[c + 1]!) {
      return { start: boundaries[c]!, end: boundaries[c + 1]! };
    }
  }
  return { start: 0, end: boundaries[1] || 0 };
}

// ============================================================================
// Corner Radius
// ============================================================================

/** Kappa constant for circular arc approximation with cubic bezier */
const KAPPA = 0.5522847498;

/**
 * Apply corner radius to corner points in a path, converting sharp corners
 * into smooth bezier arcs. Each corner point with radius > 0 is replaced by
 * two smooth points forming a circular arc.
 *
 * @param points The path points
 * @param closed Whether the path is closed
 * @param defaultRadius Optional uniform radius applied to all corner points
 *                      (overridden by per-point cornerRadius if set)
 * @returns New array of PathPoints with corners rounded
 */
export function applyCornerRadius(
  points: PathPoint[],
  closed: boolean,
  defaultRadius?: number
): PathPoint[] {
  if (points.length < 2) return points.map(clonePathPoint);

  const result: PathPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;

    // Only round corner points
    if (point.type !== 'corner') {
      result.push(clonePathPoint(point));
      continue;
    }

    const radius = point.cornerRadius ?? defaultRadius ?? 0;
    if (radius <= 0) {
      result.push(clonePathPoint(point));
      continue;
    }

    // For open paths, skip first and last points (only one adjacent edge)
    if (!closed && (i === 0 || i === points.length - 1)) {
      result.push(clonePathPoint(point));
      continue;
    }

    const prevIdx = (i - 1 + points.length) % points.length;
    const nextIdx = (i + 1) % points.length;
    const prev = points[prevIdx]!;
    const next = points[nextIdx]!;

    // Calculate directions and distances to neighbors
    const toPrev = vec2.subtract(prev.position, point.position);
    const toNext = vec2.subtract(next.position, point.position);
    const distPrev = vec2.length(toPrev);
    const distNext = vec2.length(toNext);

    // Skip degenerate edges (zero length) — use relative epsilon based on edge length
    const edgeEpsilon = Math.max(GEOMETRY_EPSILON, Math.min(distPrev, distNext) * 0.001);
    if (distPrev < edgeEpsilon || distNext < edgeEpsilon) {
      result.push(clonePathPoint(point));
      continue;
    }

    // Clamp radius so it doesn't exceed half of either edge
    const r = Math.min(radius, distPrev / 2, distNext / 2);
    if (r < edgeEpsilon) {
      result.push(clonePathPoint(point));
      continue;
    }

    // Normalize direction vectors
    const dirPrev = { x: toPrev.x / distPrev, y: toPrev.y / distPrev };
    const dirNext = { x: toNext.x / distNext, y: toNext.y / distNext };

    // Arc entry point: offset from corner toward prev by r
    const entryPos = {
      x: point.position.x + dirPrev.x * r,
      y: point.position.y + dirPrev.y * r,
    };

    // Arc exit point: offset from corner toward next by r
    const exitPos = {
      x: point.position.x + dirNext.x * r,
      y: point.position.y + dirNext.y * r,
    };

    // Handle length for circular arc approximation
    const handleLen = r * KAPPA;

    // Entry point: handleOut toward corner, no handleIn
    result.push({
      position: entryPos,
      handleIn: null,
      handleOut: { x: -dirPrev.x * handleLen, y: -dirPrev.y * handleLen },
      type: 'smooth',
    });

    // Exit point: handleIn toward corner, no handleOut
    result.push({
      position: exitPos,
      handleIn: { x: -dirNext.x * handleLen, y: -dirNext.y * handleLen },
      handleOut: null,
      type: 'smooth',
    });
  }

  return result;
}

// ============================================================================
// Shape Generators
// ============================================================================

/**
 * Create a rectangle path
 */
export function createRectanglePath(
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: [number, number, number, number] = [0, 0, 0, 0]
): PathPoint[] {
  const [tlr, trr, brr, blr] = cornerRadius;
  const hasRoundedCorners = tlr > 0 || trr > 0 || brr > 0 || blr > 0;

  if (!hasRoundedCorners) {
    // Simple rectangle - 4 corner points
    return [
      createCornerPoint({ x, y }),
      createCornerPoint({ x: x + width, y }),
      createCornerPoint({ x: x + width, y: y + height }),
      createCornerPoint({ x, y: y + height }),
    ];
  }

  // Rounded rectangle - use bezier curves for corners
  const kappa = 0.5522847498; // Magic number for circular arcs
  const points: PathPoint[] = [];

  // Top-left corner
  if (tlr > 0) {
    points.push({
      position: { x, y: y + tlr },
      handleIn: null,
      handleOut: { x: 0, y: -tlr * kappa },
      type: 'smooth',
    });
    points.push({
      position: { x: x + tlr, y },
      handleIn: { x: -tlr * kappa, y: 0 },
      handleOut: null,
      type: 'smooth',
    });
  } else {
    points.push(createCornerPoint({ x, y }));
  }

  // Top-right corner
  if (trr > 0) {
    points.push({
      position: { x: x + width - trr, y },
      handleIn: null,
      handleOut: { x: trr * kappa, y: 0 },
      type: 'smooth',
    });
    points.push({
      position: { x: x + width, y: y + trr },
      handleIn: { x: 0, y: -trr * kappa },
      handleOut: null,
      type: 'smooth',
    });
  } else {
    points.push(createCornerPoint({ x: x + width, y }));
  }

  // Bottom-right corner
  if (brr > 0) {
    points.push({
      position: { x: x + width, y: y + height - brr },
      handleIn: null,
      handleOut: { x: 0, y: brr * kappa },
      type: 'smooth',
    });
    points.push({
      position: { x: x + width - brr, y: y + height },
      handleIn: { x: brr * kappa, y: 0 },
      handleOut: null,
      type: 'smooth',
    });
  } else {
    points.push(createCornerPoint({ x: x + width, y: y + height }));
  }

  // Bottom-left corner
  if (blr > 0) {
    points.push({
      position: { x: x + blr, y: y + height },
      handleIn: null,
      handleOut: { x: -blr * kappa, y: 0 },
      type: 'smooth',
    });
    points.push({
      position: { x, y: y + height - blr },
      handleIn: { x: 0, y: blr * kappa },
      handleOut: null,
      type: 'smooth',
    });
  } else {
    points.push(createCornerPoint({ x, y: y + height }));
  }

  return points;
}

/**
 * Create an ellipse path
 */
export function createEllipsePath(cx: number, cy: number, rx: number, ry: number): PathPoint[] {
  const kappa = 0.5522847498;

  return [
    // Top
    {
      position: { x: cx, y: cy - ry },
      handleIn: { x: -rx * kappa, y: 0 },
      handleOut: { x: rx * kappa, y: 0 },
      type: 'symmetric',
    },
    // Right
    {
      position: { x: cx + rx, y: cy },
      handleIn: { x: 0, y: -ry * kappa },
      handleOut: { x: 0, y: ry * kappa },
      type: 'symmetric',
    },
    // Bottom
    {
      position: { x: cx, y: cy + ry },
      handleIn: { x: rx * kappa, y: 0 },
      handleOut: { x: -rx * kappa, y: 0 },
      type: 'symmetric',
    },
    // Left
    {
      position: { x: cx - rx, y: cy },
      handleIn: { x: 0, y: ry * kappa },
      handleOut: { x: 0, y: -ry * kappa },
      type: 'symmetric',
    },
  ];
}

/**
 * Create a regular polygon path
 */
export function createPolygonPath(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startAngle: number = Math.PI / 2,
  cornerRadius?: number
): PathPoint[] {
  if (sides < 3) sides = 3;

  const points: PathPoint[] = [];
  const angleStep = (Math.PI * 2) / sides;

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * angleStep;
    points.push(
      createCornerPoint({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    );
  }

  if (cornerRadius && cornerRadius > 0) {
    return applyCornerRadius(points, true, cornerRadius);
  }

  return points;
}

/**
 * Create a star path
 */
export function createStarPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  startAngle: number = Math.PI / 2,
  cornerRadius?: number
): PathPoint[] {
  if (points < 3) points = 3;

  const pathPoints: PathPoint[] = [];
  const angleStep = Math.PI / points;

  for (let i = 0; i < points * 2; i++) {
    const angle = startAngle + i * angleStep;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    pathPoints.push(
      createCornerPoint({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    );
  }

  if (cornerRadius && cornerRadius > 0) {
    return applyCornerRadius(pathPoints, true, cornerRadius);
  }

  return pathPoints;
}

/**
 * Calculate the precise bounding box of a regular polygon
 * Based on actual vertex positions, not the circumscribed circle
 */
// ============================================================================
// Stroke Outline Generation
// ============================================================================

/**
 * Generate stroke outline vertices from a path's tessellated vertices.
 * Expands each point perpendicular to the path direction by half the stroke width,
 * creating a closed polygon that can be filled to render the stroke.
 * This works around WebGL's lineWidth limitation (capped at 1px on most browsers).
 *
 * @param vertices Flat array of [x0, y0, x1, y1, ...] tessellated path vertices
 * @param numVertices Number of vertices (vertices.length / 2)
 * @param width Stroke width in world units
 * @param closed Whether the source path is closed
 * @returns Flat Float32Array of outline vertices forming a closed polygon
 */
export function generateStrokeOutlineVertices(
  vertices: Float32Array,
  numVertices: number,
  width: number,
  closed: boolean,
  align: 'center' | 'inside' | 'outside' = 'center',
  widthProfile?: number[]
): Float32Array {
  if (numVertices < 2) return new Float32Array(0);

  const halfWidth = Math.max(width / 2, 0.5);
  // Compute per-side offsets based on alignment
  // Left = outward (positive perpendicular), Right = inward (negative perpendicular)
  let leftOffset: number;
  let rightOffset: number;
  if (align === 'inside') {
    leftOffset = 0;
    rightOffset = -Math.max(width, 0.5);
  } else if (align === 'outside') {
    leftOffset = Math.max(width, 0.5);
    rightOffset = 0;
  } else {
    leftOffset = halfWidth;
    rightOffset = -halfWidth;
  }

  // The perpendicular (-dy, dx) points toward the interior when the loop is
  // positively wound (every app-generated closed shape is), which inverts the
  // meaning of inside/outside. Detect winding via the signed (shoelace) area and
  // flip the offsets so 'inside' offsets toward the interior and 'outside' away.
  // Center stays symmetric, so this is a no-op there and for open paths.
  if (closed) {
    let signedArea = 0;
    for (let i = 0; i < numVertices; i++) {
      const j = (i + 1) % numVertices;
      const xi = vertices[i * 2] as number;
      const yi = vertices[i * 2 + 1] as number;
      const xj = vertices[j * 2] as number;
      const yj = vertices[j * 2 + 1] as number;
      signedArea += xi * yj - xj * yi;
    }
    if (signedArea > 0) {
      leftOffset = -leftOffset;
      rightOffset = -rightOffset;
    }
  }

  const leftSide: number[] = [];
  const rightSide: number[] = [];

  let lastPerpX = 0;
  let lastPerpY = 1; // Default perpendicular direction

  for (let i = 0; i < numVertices; i++) {
    const cx = vertices[i * 2] as number;
    const cy = vertices[i * 2 + 1] as number;

    const prevIdx = i > 0 ? i - 1 : closed ? numVertices - 1 : -1;
    const nextIdx = i < numVertices - 1 ? i + 1 : closed ? 0 : -1;

    let perpX: number;
    let perpY: number;
    let miterScale = 1;

    if (prevIdx >= 0 && nextIdx >= 0) {
      // Both neighbors exist — compute proper miter join bisector
      // Incoming edge normal (prev → current)
      const inDx = cx - (vertices[prevIdx * 2] as number);
      const inDy = cy - (vertices[prevIdx * 2 + 1] as number);
      const inLen = Math.sqrt(inDx * inDx + inDy * inDy);
      // Outgoing edge normal (current → next)
      const outDx = (vertices[nextIdx * 2] as number) - cx;
      const outDy = (vertices[nextIdx * 2 + 1] as number) - cy;
      const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

      if (inLen < GEOMETRY_EPSILON && outLen < GEOMETRY_EPSILON) {
        perpX = lastPerpX;
        perpY = lastPerpY;
      } else if (inLen < GEOMETRY_EPSILON) {
        perpX = -outDy / outLen;
        perpY = outDx / outLen;
      } else if (outLen < GEOMETRY_EPSILON) {
        perpX = -inDy / inLen;
        perpY = inDx / inLen;
      } else {
        // Per-edge normals (rotate edge tangent 90° CCW: (-dy, dx))
        const n1x = -inDy / inLen;
        const n1y = inDx / inLen;
        const n2x = -outDy / outLen;
        const n2y = outDx / outLen;

        // Miter bisector = sum of the two unit normals
        const mx = n1x + n2x;
        const my = n1y + n2y;
        const mLen = Math.sqrt(mx * mx + my * my);

        if (mLen < GEOMETRY_EPSILON) {
          // Normals cancel out (180° turn) — use incoming normal
          perpX = n1x;
          perpY = n1y;
        } else {
          // Normalize miter direction
          perpX = mx / mLen;
          perpY = my / mLen;
          // Scale so perpendicular distance from each edge = offset
          // miterScale = 1 / dot(edgeNormal, miterDir)
          const dot = n1x * perpX + n1y * perpY;
          if (dot > GEOMETRY_EPSILON) {
            miterScale = 1 / dot;
            // Miter limit: cap at 4× to avoid extremely long spikes at acute angles
            if (miterScale > 4) miterScale = 4;
          }
        }
      }
      lastPerpX = perpX;
      lastPerpY = perpY;
    } else if (nextIdx >= 0) {
      // First point of open path: use outgoing edge normal
      const dx = (vertices[nextIdx * 2] as number) - cx;
      const dy = (vertices[nextIdx * 2 + 1] as number) - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < GEOMETRY_EPSILON) {
        perpX = lastPerpX;
        perpY = lastPerpY;
      } else {
        perpX = -dy / len;
        perpY = dx / len;
        lastPerpX = perpX;
        lastPerpY = perpY;
      }
    } else if (prevIdx >= 0) {
      // Last point of open path: use incoming edge normal
      const dx = cx - (vertices[prevIdx * 2] as number);
      const dy = cy - (vertices[prevIdx * 2 + 1] as number);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < GEOMETRY_EPSILON) {
        perpX = lastPerpX;
        perpY = lastPerpY;
      } else {
        perpX = -dy / len;
        perpY = dx / len;
        lastPerpX = perpX;
        lastPerpY = perpY;
      }
    } else {
      perpX = lastPerpX;
      perpY = lastPerpY;
    }

    // Apply width profile multiplier if provided
    let effLeftOffset = leftOffset;
    let effRightOffset = rightOffset;
    if (widthProfile && widthProfile.length >= 2) {
      const t = numVertices > 1 ? i / (numVertices - 1) : 0;
      const profileLen = widthProfile.length;
      const fi = t * (profileLen - 1);
      const lo = Math.floor(fi);
      const hi = Math.min(lo + 1, profileLen - 1);
      const frac = fi - lo;
      const multiplier = widthProfile[lo]! + frac * (widthProfile[hi]! - widthProfile[lo]!);
      effLeftOffset = leftOffset * multiplier;
      effRightOffset = rightOffset * multiplier;
    }

    const scaledLeft = effLeftOffset * miterScale;
    const scaledRight = effRightOffset * miterScale;
    leftSide.push(cx + perpX * scaledLeft, cy + perpY * scaledLeft);
    rightSide.push(cx + perpX * scaledRight, cy + perpY * scaledRight);
  }

  // Combine: left side forward + right side reversed = closed polygon
  const totalCoords = leftSide.length + rightSide.length;
  const outline = new Float32Array(totalCoords);
  // Copy left side
  for (let i = 0; i < leftSide.length; i++) {
    outline[i] = leftSide[i]!;
  }
  // Copy right side in reverse order
  const rightCount = rightSide.length / 2;
  for (let i = 0; i < rightCount; i++) {
    const srcIdx = (rightCount - 1 - i) * 2;
    const dstIdx = leftSide.length + i * 2;
    outline[dstIdx] = rightSide[srcIdx]!;
    outline[dstIdx + 1] = rightSide[srcIdx + 1]!;
  }

  return outline;
}

// ============================================================================
// Polygon Bounds
// ============================================================================

export function getPolygonBounds(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  scaleX: number = 1,
  scaleY: number = 1,
  innerRadius?: number
): Rect {
  const startAngle = Math.PI / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  if (innerRadius !== undefined) {
    // Star shape - check both outer and inner vertices
    const angleStep = Math.PI / sides;
    for (let i = 0; i < sides * 2; i++) {
      const angle = startAngle + i * angleStep;
      const r = i % 2 === 0 ? radius : innerRadius;
      const x = cx + Math.cos(angle) * r * scaleX;
      const y = cy + Math.sin(angle) * r * scaleY;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  } else {
    // Regular polygon
    const angleStep = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + i * angleStep;
      const x = cx + Math.cos(angle) * radius * scaleX;
      const y = cy + Math.sin(angle) * radius * scaleY;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
