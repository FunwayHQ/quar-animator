/**
 * Bezier Curve Utilities for Quar Animator
 * Provides functions for working with quadratic and cubic bezier curves
 */

import type { Vector2, Rect } from '@quar/types';
import { vec2, EPSILON } from '../math';

// ============================================================================
// Types
// ============================================================================

export interface CubicCurve {
  p0: Vector2;
  p1: Vector2;
  p2: Vector2;
  p3: Vector2;
}

export interface QuadraticCurve {
  p0: Vector2;
  p1: Vector2;
  p2: Vector2;
}

export interface NearestPointResult {
  t: number;
  point: Vector2;
  distance: number;
}

// ============================================================================
// Bezier Utilities
// ============================================================================

export const bezier = {
  /**
   * Evaluate a cubic bezier curve at parameter t
   * P(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
   */
  cubicPoint(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    };
  },

  /**
   * Evaluate a quadratic bezier curve at parameter t
   * P(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
   */
  quadraticPoint(p0: Vector2, p1: Vector2, p2: Vector2, t: number): Vector2 {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    return {
      x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
      y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y,
    };
  },

  /**
   * Compute the derivative of a cubic bezier at parameter t
   * P'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
   */
  cubicDerivative(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    return {
      x: 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
      y: 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y),
    };
  },

  /**
   * Compute the second derivative of a cubic bezier at parameter t
   * P''(t) = 6(1-t)(P2-2P1+P0) + 6t(P3-2P2+P1)
   */
  cubicSecondDerivative(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
    const mt = 1 - t;

    return {
      x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
      y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
    };
  },

  /**
   * Subdivide a cubic bezier curve at parameter t using de Casteljau's algorithm
   * Returns two curves that together represent the original curve
   */
  subdivide(
    p0: Vector2,
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    t: number
  ): [CubicCurve, CubicCurve] {
    // Level 1
    const p01 = vec2.lerp(p0, p1, t);
    const p12 = vec2.lerp(p1, p2, t);
    const p23 = vec2.lerp(p2, p3, t);

    // Level 2
    const p012 = vec2.lerp(p01, p12, t);
    const p123 = vec2.lerp(p12, p23, t);

    // Level 3 - the point on the curve
    const p0123 = vec2.lerp(p012, p123, t);

    return [
      { p0, p1: p01, p2: p012, p3: p0123 },
      { p0: p0123, p1: p123, p2: p23, p3 },
    ];
  },

  /**
   * Calculate the approximate arc length of a cubic bezier curve
   * Uses recursive subdivision until segments are small enough
   */
  cubicLength(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, tolerance: number = 0.1): number {
    const chordLength = vec2.distance(p0, p3);
    const controlLength = vec2.distance(p0, p1) + vec2.distance(p1, p2) + vec2.distance(p2, p3);

    if (controlLength - chordLength < tolerance) {
      return (controlLength + chordLength) / 2;
    }

    const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.5);
    return (
      bezier.cubicLength(left.p0, left.p1, left.p2, left.p3, tolerance) +
      bezier.cubicLength(right.p0, right.p1, right.p2, right.p3, tolerance)
    );
  },

  /**
   * Tessellate a cubic bezier curve into line segments
   * Uses adaptive subdivision based on curvature tolerance
   */
  tessellate(
    p0: Vector2,
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    tolerance: number = 1.0
  ): Vector2[] {
    const points: Vector2[] = [vec2.clone(p0)];

    const subdivideAdaptive = (
      p0: Vector2,
      p1: Vector2,
      p2: Vector2,
      p3: Vector2,
      depth: number = 0
    ): void => {
      // Flatness test: check if control points are close to the line p0-p3
      const d1 = pointLineDistance(p1, p0, p3);
      const d2 = pointLineDistance(p2, p0, p3);

      // Cap recursion at depth 10 to guarantee termination and bound
      // the maximum number of output segments to 2^10 = 1024.
      if ((d1 + d2 < tolerance && depth > 0) || depth > 10) {
        points.push(vec2.clone(p3));
        return;
      }

      // Subdivide and recurse
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.5);
      subdivideAdaptive(left.p0, left.p1, left.p2, left.p3, depth + 1);
      subdivideAdaptive(right.p0, right.p1, right.p2, right.p3, depth + 1);
    };

    subdivideAdaptive(p0, p1, p2, p3);
    return points;
  },

  /**
   * Tessellate a quadratic bezier into line segments
   */
  tessellateQuadratic(p0: Vector2, p1: Vector2, p2: Vector2, tolerance: number = 1.0): Vector2[] {
    // Convert quadratic to cubic for unified handling
    // Cubic control points from quadratic:
    // CP1 = P0 + 2/3 * (P1 - P0)
    // CP2 = P2 + 2/3 * (P1 - P2)
    const cp1: Vector2 = {
      x: p0.x + (2 / 3) * (p1.x - p0.x),
      y: p0.y + (2 / 3) * (p1.y - p0.y),
    };
    const cp2: Vector2 = {
      x: p2.x + (2 / 3) * (p1.x - p2.x),
      y: p2.y + (2 / 3) * (p1.y - p2.y),
    };

    return bezier.tessellate(p0, cp1, cp2, p2, tolerance);
  },

  /**
   * Calculate the bounding box of a cubic bezier curve
   */
  bounds(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2): Rect {
    // Start with endpoints
    let minX = Math.min(p0.x, p3.x);
    let maxX = Math.max(p0.x, p3.x);
    let minY = Math.min(p0.y, p3.y);
    let maxY = Math.max(p0.y, p3.y);

    // Find extrema by solving derivative = 0
    // For cubic: at² + bt + c = 0 where
    // a = 3(-p0 + 3p1 - 3p2 + p3)
    // b = 6(p0 - 2p1 + p2)
    // c = 3(p1 - p0)

    const checkExtrema = (
      p0v: number,
      p1v: number,
      p2v: number,
      p3v: number,
      updateMinMax: (v: number) => void
    ) => {
      const a = 3 * (-p0v + 3 * p1v - 3 * p2v + p3v);
      const b = 6 * (p0v - 2 * p1v + p2v);
      const c = 3 * (p1v - p0v);

      if (Math.abs(a) < EPSILON) {
        // Linear case
        if (Math.abs(b) > EPSILON) {
          const t = -c / b;
          if (t > 0 && t < 1) {
            const mt = 1 - t;
            const value =
              mt * mt * mt * p0v + 3 * mt * mt * t * p1v + 3 * mt * t * t * p2v + t * t * t * p3v;
            updateMinMax(value);
          }
        }
      } else {
        // Quadratic case
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
          const sqrtD = Math.sqrt(discriminant);
          const t1 = (-b + sqrtD) / (2 * a);
          const t2 = (-b - sqrtD) / (2 * a);

          for (const t of [t1, t2]) {
            if (t > 0 && t < 1) {
              const mt = 1 - t;
              const value =
                mt * mt * mt * p0v + 3 * mt * mt * t * p1v + 3 * mt * t * t * p2v + t * t * t * p3v;
              updateMinMax(value);
            }
          }
        }
      }
    };

    checkExtrema(p0.x, p1.x, p2.x, p3.x, (v) => {
      minX = Math.min(minX, v);
      maxX = Math.max(maxX, v);
    });

    checkExtrema(p0.y, p1.y, p2.y, p3.y, (v) => {
      minY = Math.min(minY, v);
      maxY = Math.max(maxY, v);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  },

  /**
   * Find the nearest point on a cubic bezier to a given point
   * Uses Newton-Raphson iteration with initial sampling
   */
  nearestPoint(
    p0: Vector2,
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    point: Vector2
  ): NearestPointResult {
    // Sample the curve to find a good starting point
    const samples = 20;
    let bestT = 0;
    let bestDist = Infinity;

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const curvePoint = bezier.cubicPoint(p0, p1, p2, p3, t);
      const dist = vec2.distanceSquared(curvePoint, point);

      if (dist < bestDist) {
        bestDist = dist;
        bestT = t;
      }
    }

    // Refine using Newton-Raphson
    let t = bestT;
    for (let i = 0; i < 5; i++) {
      const curvePoint = bezier.cubicPoint(p0, p1, p2, p3, t);
      const derivative = bezier.cubicDerivative(p0, p1, p2, p3, t);
      const secondDerivative = bezier.cubicSecondDerivative(p0, p1, p2, p3, t);

      // Distance squared derivative: 2 * (P(t) - point) · P'(t)
      const diff = vec2.subtract(curvePoint, point);
      const numerator = vec2.dot(diff, derivative);

      // Second derivative of distance squared
      const denominator = vec2.dot(derivative, derivative) + vec2.dot(diff, secondDerivative);

      if (Math.abs(denominator) < EPSILON) break;

      const delta = numerator / denominator;
      t = Math.max(0, Math.min(1, t - delta));

      if (Math.abs(delta) < 1e-6) break;
    }

    const finalPoint = bezier.cubicPoint(p0, p1, p2, p3, t);
    return {
      t,
      point: finalPoint,
      distance: vec2.distance(finalPoint, point),
    };
  },

  /**
   * Convert a quadratic bezier to a cubic bezier
   */
  quadraticToCubic(p0: Vector2, p1: Vector2, p2: Vector2): CubicCurve {
    return {
      p0,
      p1: {
        x: p0.x + (2 / 3) * (p1.x - p0.x),
        y: p0.y + (2 / 3) * (p1.y - p0.y),
      },
      p2: {
        x: p2.x + (2 / 3) * (p1.x - p2.x),
        y: p2.y + (2 / 3) * (p1.y - p2.y),
      },
      p3: p2,
    };
  },

  /**
   * Split a cubic bezier at multiple t values
   */
  splitAtMultiple(
    p0: Vector2,
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    tValues: number[]
  ): CubicCurve[] {
    if (tValues.length === 0) {
      return [{ p0, p1, p2, p3 }];
    }

    // Sort t values
    const sorted = [...tValues].sort((a, b) => a - b);
    const curves: CubicCurve[] = [];

    let currentCurve: CubicCurve = { p0, p1, p2, p3 };
    let consumedT = 0;

    for (const t of sorted) {
      if (t <= 0 || t >= 1) continue;

      // Guard against division by zero when consumedT approaches 1
      if (1 - consumedT < EPSILON) continue;

      // Adjust t for the current segment
      const adjustedT = (t - consumedT) / (1 - consumedT);

      const [left, right] = bezier.subdivide(
        currentCurve.p0,
        currentCurve.p1,
        currentCurve.p2,
        currentCurve.p3,
        adjustedT
      );

      curves.push(left);
      currentCurve = right;
      consumedT = t;
    }

    curves.push(currentCurve);
    return curves;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function pointLineDistance(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < EPSILON * EPSILON) {
    return vec2.distance(point, lineStart);
  }

  // Calculate perpendicular distance
  const t = Math.max(
    0,
    Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq)
  );

  const projection: Vector2 = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };

  return vec2.distance(point, projection);
}
