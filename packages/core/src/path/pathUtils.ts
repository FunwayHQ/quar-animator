/**
 * Path Utilities for Quar Animator
 * Functions for working with PathPoint arrays and path tessellation
 */

import type { PathPoint, Vector2, Rect } from '@quar/types';
import { vec2 } from '../math';
import { bezier } from './bezier';

// ============================================================================
// PathPoint Creation
// ============================================================================

/**
 * Create a corner PathPoint (no bezier handles)
 */
export function createCornerPoint(position: Vector2): PathPoint {
  return {
    position: { ...position },
    handleIn: null,
    handleOut: null,
    type: 'corner',
  };
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
  return {
    position: { ...point.position },
    handleIn: point.handleIn ? { ...point.handleIn } : null,
    handleOut: point.handleOut ? { ...point.handleOut } : null,
    type: point.type,
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
      x: points[0].position.x,
      y: points[0].position.y,
      width: 0,
      height: 0,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const updateBounds = (rect: Rect) => {
    minX = Math.min(minX, rect.x);
    maxX = Math.max(maxX, rect.x + rect.width);
    minY = Math.min(minY, rect.y);
    maxY = Math.max(maxY, rect.y + rect.height);
  };

  const segmentCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];

    const segmentBounds = getSegmentBounds(p0, p1);
    updateBounds(segmentBounds);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate bounds for a single path segment between two points
 */
export function getSegmentBounds(p0: PathPoint, p1: PathPoint): Rect {
  // Get absolute handle positions
  const cp1 = p0.handleOut
    ? vec2.add(p0.position, p0.handleOut)
    : p0.position;
  const cp2 = p1.handleIn
    ? vec2.add(p1.position, p1.handleIn)
    : p1.position;

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
    return new Float32Array([points[0].position.x, points[0].position.y]);
  }

  const vertices: number[] = [];
  const segmentCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const segmentPoints = tessellateSegment(p0, p1, tolerance);

    // Add segment points (skip first point for subsequent segments to avoid duplicates)
    const startIndex = i === 0 ? 0 : 1;
    for (let j = startIndex; j < segmentPoints.length; j++) {
      vertices.push(segmentPoints[j].x, segmentPoints[j].y);
    }
  }

  // Close the path if needed
  if (closed && vertices.length >= 4) {
    // Add closing point if not already at start
    const firstX = vertices[0];
    const firstY = vertices[1];
    const lastX = vertices[vertices.length - 2];
    const lastY = vertices[vertices.length - 1];

    if (Math.abs(lastX - firstX) > 0.001 || Math.abs(lastY - firstY) > 0.001) {
      vertices.push(firstX, firstY);
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
  // Get absolute control point positions
  const cp1 = p0.handleOut
    ? vec2.add(p0.position, p0.handleOut)
    : p0.position;
  const cp2 = p1.handleIn
    ? vec2.add(p1.position, p1.handleIn)
    : p1.position;

  // If both handles are null (straight line), return just the endpoints
  if (!p0.handleOut && !p1.handleIn) {
    return [vec2.clone(p0.position), vec2.clone(p1.position)];
  }

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
    result.push({ x: vertices[i], y: vertices[i + 1] });
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
  return points.map((point, index, arr) => {
    const newPoint = clonePathPoint(point);
    // Swap handles
    const tempHandle = newPoint.handleIn;
    newPoint.handleIn = newPoint.handleOut;
    newPoint.handleOut = tempHandle;
    return newPoint;
  }).reverse();
}

/**
 * Calculate the approximate length of a path
 */
export function getPathLength(points: PathPoint[], closed: boolean): number {
  if (points.length < 2) return 0;

  let totalLength = 0;
  const segmentCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    totalLength += getSegmentLength(p0, p1);
  }

  return totalLength;
}

/**
 * Calculate the length of a single segment
 */
export function getSegmentLength(p0: PathPoint, p1: PathPoint): number {
  const cp1 = p0.handleOut
    ? vec2.add(p0.position, p0.handleOut)
    : p0.position;
  const cp2 = p1.handleIn
    ? vec2.add(p1.position, p1.handleIn)
    : p1.position;

  return bezier.cubicLength(p0.position, cp1, cp2, p1.position);
}

/**
 * Get a point on the path at a given t (0-1)
 */
export function getPointOnPath(
  points: PathPoint[],
  closed: boolean,
  t: number
): Vector2 | null {
  if (points.length === 0) return null;
  if (points.length === 1) return vec2.clone(points[0].position);

  const segmentCount = closed ? points.length : points.length - 1;
  const totalSegments = segmentCount;

  // Clamp t
  t = Math.max(0, Math.min(1, t));

  // Find which segment t falls into
  const segmentIndex = Math.min(
    Math.floor(t * totalSegments),
    totalSegments - 1
  );
  const segmentT = (t * totalSegments) - segmentIndex;

  const p0 = points[segmentIndex];
  const p1 = points[(segmentIndex + 1) % points.length];

  const cp1 = p0.handleOut
    ? vec2.add(p0.position, p0.handleOut)
    : p0.position;
  const cp2 = p1.handleIn
    ? vec2.add(p1.position, p1.handleIn)
    : p1.position;

  return bezier.cubicPoint(p0.position, cp1, cp2, p1.position, segmentT);
}

/**
 * Get the tangent direction at a point on the path
 */
export function getTangentOnPath(
  points: PathPoint[],
  closed: boolean,
  t: number
): Vector2 | null {
  if (points.length < 2) return null;

  const segmentCount = closed ? points.length : points.length - 1;
  const totalSegments = segmentCount;

  t = Math.max(0, Math.min(1, t));

  const segmentIndex = Math.min(
    Math.floor(t * totalSegments),
    totalSegments - 1
  );
  const segmentT = (t * totalSegments) - segmentIndex;

  const p0 = points[segmentIndex];
  const p1 = points[(segmentIndex + 1) % points.length];

  const cp1 = p0.handleOut
    ? vec2.add(p0.position, p0.handleOut)
    : p0.position;
  const cp2 = p1.handleIn
    ? vec2.add(p1.position, p1.handleIn)
    : p1.position;

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
      point: vec2.clone(points[0].position),
      t: 0,
      distance: vec2.distance(queryPoint, points[0].position),
      segmentIndex: 0,
    };
  }

  let bestResult = {
    point: vec2.clone(points[0].position),
    t: 0,
    distance: Infinity,
    segmentIndex: 0,
  };

  const segmentCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];

    const cp1 = p0.handleOut
      ? vec2.add(p0.position, p0.handleOut)
      : p0.position;
    const cp2 = p1.handleIn
      ? vec2.add(p1.position, p1.handleIn)
      : p1.position;

    const result = bezier.nearestPoint(p0.position, cp1, cp2, p1.position, queryPoint);

    if (result.distance < bestResult.distance) {
      bestResult = {
        point: result.point,
        t: (i + result.t) / segmentCount,
        distance: result.distance,
        segmentIndex: i,
      };
    }
  }

  return bestResult;
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
export function createEllipsePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number
): PathPoint[] {
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
  startAngle: number = -Math.PI / 2
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
  startAngle: number = -Math.PI / 2
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

  return pathPoints;
}
