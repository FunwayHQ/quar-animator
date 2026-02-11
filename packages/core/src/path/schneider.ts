/**
 * Schneider's Algorithm for cubic Bezier curve fitting.
 *
 * Given a sequence of 2D points, fits a chain of G1-continuous cubic Bezier
 * curves that approximates the polyline within a given error tolerance.
 *
 * Reference: Philip J. Schneider, "An Algorithm for Automatically Fitting
 * Digitized Curves", in Graphics Gems I, Academic Press, 1990.
 */

import type { PathPoint, Vector2 } from '@quar/types';
import { vec2, EPSILON } from '../math';
import { bezier } from './bezier';

// ============================================================================
// Types
// ============================================================================

export interface CubicSegment {
  p0: Vector2;
  p1: Vector2;
  p2: Vector2;
  p3: Vector2;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum Newton-Raphson reparameterization iterations */
const MAX_ITERATIONS = 4;

/** Maximum recursion depth for subdivision */
const MAX_DEPTH = 20;

// ============================================================================
// Public API
// ============================================================================

/**
 * Fit a chain of cubic Bezier curves to a polyline using Schneider's Algorithm.
 *
 * @param points Input polyline points (at least 2)
 * @param maxError Maximum allowed squared distance from any point to the curve
 * @returns Array of cubic Bezier segments
 */
export function schneiderFitCurve(points: Vector2[], maxError: number): CubicSegment[] {
  if (points.length < 2) return [];

  if (points.length === 2) {
    return [lineSegment(points[0], points[1])];
  }

  // Remove duplicate consecutive points
  const cleaned = removeDuplicates(points);
  if (cleaned.length < 2) return [];
  if (cleaned.length === 2) {
    return [lineSegment(cleaned[0], cleaned[1])];
  }

  // Compute endpoint tangents
  const tHat1 = computeLeftTangent(cleaned, 0);
  const tHat2 = computeRightTangent(cleaned, cleaned.length - 1);

  const result: CubicSegment[] = [];
  fitCubic(cleaned, 0, cleaned.length - 1, tHat1, tHat2, maxError, result, 0);
  return result;
}

/**
 * Convert an array of CubicSegments into PathPoints with smooth handles.
 * Adjacent segments share endpoints, producing a G1-continuous path.
 */
export function curvesToPathPoints(curves: CubicSegment[]): PathPoint[] {
  if (curves.length === 0) return [];

  const pathPoints: PathPoint[] = [];

  for (let i = 0; i < curves.length; i++) {
    const seg = curves[i];

    if (i === 0) {
      // First point of first segment
      const handleOut = vec2.subtract(seg.p1, seg.p0);
      pathPoints.push({
        position: { ...seg.p0 },
        handleIn: null,
        handleOut: vec2.length(handleOut) > EPSILON ? handleOut : null,
        type: 'smooth',
      });
    }

    // End point of this segment = start point of next (or last point)
    const handleIn = vec2.subtract(seg.p2, seg.p3);

    if (i < curves.length - 1) {
      const nextSeg = curves[i + 1];
      const handleOut = vec2.subtract(nextSeg.p1, nextSeg.p0);
      pathPoints.push({
        position: { ...seg.p3 },
        handleIn: vec2.length(handleIn) > EPSILON ? handleIn : null,
        handleOut: vec2.length(handleOut) > EPSILON ? handleOut : null,
        type: 'smooth',
      });
    } else {
      // Last point
      pathPoints.push({
        position: { ...seg.p3 },
        handleIn: vec2.length(handleIn) > EPSILON ? handleIn : null,
        handleOut: null,
        type: 'smooth',
      });
    }
  }

  return pathPoints;
}

// ============================================================================
// Core Algorithm
// ============================================================================

/**
 * Recursively fit cubic Bezier curves to points[first..last].
 */
function fitCubic(
  points: Vector2[],
  first: number,
  last: number,
  tHat1: Vector2,
  tHat2: Vector2,
  error: number,
  result: CubicSegment[],
  depth: number
): void {
  const nPts = last - first + 1;

  // Degenerate: use simple line segment for very short runs
  if (nPts === 2) {
    result.push(lineSegment(points[first], points[last]));
    return;
  }

  // Chord-length parameterize
  let u = chordLengthParameterize(points, first, last);

  // Generate a bezier curve
  let bezCurve = generateBezier(points, first, last, u, tHat1, tHat2);

  // Find max deviation of points to fitted curve
  let { maxError: maxDist, splitPoint } = computeMaxError(points, first, last, bezCurve, u);

  if (maxDist < error) {
    result.push(bezCurve);
    return;
  }

  // If error is somewhat small, try reparameterization and refit
  if (maxDist < error * 4) {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const uPrime = reparameterize(points, first, last, u, bezCurve);
      bezCurve = generateBezier(points, first, last, uPrime, tHat1, tHat2);
      const result2 = computeMaxError(points, first, last, bezCurve, uPrime);
      maxDist = result2.maxError;
      splitPoint = result2.splitPoint;

      if (maxDist < error) {
        result.push(bezCurve);
        return;
      }
      u = uPrime;
    }
  }

  // Fitting failed — subdivide at point of maximum error and recurse
  if (depth >= MAX_DEPTH) {
    // Bail: just output what we have
    result.push(bezCurve);
    return;
  }

  const tHatCenter = computeCenterTangent(points, splitPoint);
  fitCubic(points, first, splitPoint, tHat1, tHatCenter, error, result, depth + 1);
  fitCubic(
    points,
    splitPoint,
    last,
    vec2.multiply(tHatCenter, -1),
    tHat2,
    error,
    result,
    depth + 1
  );
}

// ============================================================================
// Bezier Generation (Least-Squares Fit)
// ============================================================================

/**
 * Generate a cubic Bezier curve that best fits points[first..last]
 * using a least-squares approach.
 */
function generateBezier(
  points: Vector2[],
  first: number,
  last: number,
  uPrime: number[],
  tHat1: Vector2,
  tHat2: Vector2
): CubicSegment {
  const nPts = last - first + 1;
  const p0 = points[first];
  const p3 = points[last];

  // Compute the A matrix rows: A[i] = [B1(u)*tHat1, B2(u)*tHat2]
  const A: [Vector2, Vector2][] = [];
  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i];
    const b1 = bernstein1(u); // 3(1-t)^2 * t
    const b2 = bernstein2(u); // 3(1-t) * t^2
    A.push([vec2.multiply(tHat1, b1), vec2.multiply(tHat2, b2)]);
  }

  // Build C and X matrices for 2x2 system
  const C: [[number, number], [number, number]] = [
    [0, 0],
    [0, 0],
  ];
  const X: [number, number] = [0, 0];

  for (let i = 0; i < nPts; i++) {
    C[0][0] += vec2.dot(A[i][0], A[i][0]);
    C[0][1] += vec2.dot(A[i][0], A[i][1]);
    C[1][0] = C[0][1]; // symmetric
    C[1][1] += vec2.dot(A[i][1], A[i][1]);

    const u = uPrime[i];
    const tmp = vec2.subtract(points[first + i], bezier.cubicPoint(p0, p0, p3, p3, u));

    X[0] += vec2.dot(A[i][0], tmp);
    X[1] += vec2.dot(A[i][1], tmp);
  }

  // Solve 2x2 system: C * [alpha_l, alpha_r]^T = X
  const det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
  let alphaL: number;
  let alphaR: number;

  if (Math.abs(det) > EPSILON) {
    alphaL = (C[1][1] * X[0] - C[0][1] * X[1]) / det;
    alphaR = (C[0][0] * X[1] - C[1][0] * X[0]) / det;
  } else {
    // Fallback: alpha based on segment length
    const dist = vec2.distance(p0, p3);
    alphaL = alphaR = dist / 3;
  }

  // If alpha negative or zero, use heuristic
  const segLength = vec2.distance(p0, p3);
  const epsilon = EPSILON * segLength;

  if (alphaL < epsilon || alphaR < epsilon) {
    alphaL = alphaR = segLength / 3;
  }

  const p1 = vec2.add(p0, vec2.multiply(tHat1, alphaL));
  const p2 = vec2.add(p3, vec2.multiply(tHat2, alphaR));

  return { p0, p1, p2, p3 };
}

// ============================================================================
// Reparameterization (Newton-Raphson)
// ============================================================================

/**
 * Improve parameter values via Newton-Raphson iteration.
 *
 * u'[i] = u[i] - dot(Q(u)-P, Q'(u)) / (dot(Q',Q') + dot(Q(u)-P, Q''(u)))
 */
function reparameterize(
  points: Vector2[],
  first: number,
  last: number,
  u: number[],
  bezCurve: CubicSegment
): number[] {
  const nPts = last - first + 1;
  const uPrime: number[] = [];

  for (let i = 0; i < nPts; i++) {
    const p = points[first + i];
    const qU = bezier.cubicPoint(bezCurve.p0, bezCurve.p1, bezCurve.p2, bezCurve.p3, u[i]);
    const qPrime = bezier.cubicDerivative(bezCurve.p0, bezCurve.p1, bezCurve.p2, bezCurve.p3, u[i]);
    const qPrimePrime = bezier.cubicSecondDerivative(
      bezCurve.p0,
      bezCurve.p1,
      bezCurve.p2,
      bezCurve.p3,
      u[i]
    );

    const diff = vec2.subtract(qU, p);
    const numerator = vec2.dot(diff, qPrime);
    const denominator = vec2.dot(qPrime, qPrime) + vec2.dot(diff, qPrimePrime);

    if (Math.abs(denominator) > EPSILON) {
      uPrime.push(Math.max(0, Math.min(1, u[i] - numerator / denominator)));
    } else {
      uPrime.push(u[i]);
    }
  }

  return uPrime;
}

// ============================================================================
// Error Computation
// ============================================================================

/**
 * Find the maximum squared distance of any point to the fitted curve.
 * Also returns the index of the worst-fitting point for subdivision.
 */
function computeMaxError(
  points: Vector2[],
  first: number,
  last: number,
  bezCurve: CubicSegment,
  u: number[]
): { maxError: number; splitPoint: number } {
  let maxDist = 0;
  let splitPoint = Math.floor((last - first + 1) / 2) + first;

  for (let i = first + 1; i < last; i++) {
    const p = bezier.cubicPoint(bezCurve.p0, bezCurve.p1, bezCurve.p2, bezCurve.p3, u[i - first]);
    const dist = vec2.distanceSquared(points[i], p);

    if (dist >= maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }

  return { maxError: maxDist, splitPoint };
}

// ============================================================================
// Parameterization
// ============================================================================

/**
 * Assign parameter values to digitized points using chord-length parameterization.
 */
function chordLengthParameterize(points: Vector2[], first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[u.length - 1] + vec2.distance(points[i], points[i - 1]));
  }

  // Normalize to [0, 1]
  const totalLength = u[u.length - 1];
  if (totalLength > EPSILON) {
    for (let i = 1; i < u.length; i++) {
      u[i] /= totalLength;
    }
  }
  // Ensure last value is exactly 1
  u[u.length - 1] = 1;

  return u;
}

// ============================================================================
// Tangent Computation
// ============================================================================

function computeLeftTangent(points: Vector2[], index: number): Vector2 {
  const tangent = vec2.subtract(points[index + 1], points[index]);
  return vec2.normalize(tangent);
}

function computeRightTangent(points: Vector2[], index: number): Vector2 {
  const tangent = vec2.subtract(points[index - 1], points[index]);
  return vec2.normalize(tangent);
}

function computeCenterTangent(points: Vector2[], index: number): Vector2 {
  const v1 = vec2.subtract(points[index - 1], points[index]);
  const v2 = vec2.subtract(points[index], points[index + 1]);
  const avg = {
    x: (v1.x + v2.x) / 2,
    y: (v1.y + v2.y) / 2,
  };
  return vec2.normalize(avg);
}

// ============================================================================
// Bernstein Basis Functions
// ============================================================================

/** B1(t) = 3(1-t)^2 * t */
function bernstein1(t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t;
}

/** B2(t) = 3(1-t) * t^2 */
function bernstein2(t: number): number {
  return 3 * (1 - t) * t * t;
}

// ============================================================================
// Utilities
// ============================================================================

function lineSegment(p0: Vector2, p1: Vector2): CubicSegment {
  const dist = vec2.distance(p0, p1);
  const dir = dist > EPSILON ? vec2.normalize(vec2.subtract(p1, p0)) : { x: 1, y: 0 };
  const thirdDist = dist / 3;
  return {
    p0: { ...p0 },
    p1: vec2.add(p0, vec2.multiply(dir, thirdDist)),
    p2: vec2.subtract(p1, vec2.multiply(dir, thirdDist)),
    p3: { ...p1 },
  };
}

function removeDuplicates(points: Vector2[]): Vector2[] {
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (vec2.distanceSquared(points[i], result[result.length - 1]) > EPSILON * EPSILON) {
      result.push(points[i]);
    }
  }
  return result;
}
