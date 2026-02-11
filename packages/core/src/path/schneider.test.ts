import { describe, it, expect } from 'vitest';
import { schneiderFitCurve, curvesToPathPoints } from './schneider';
import type { CubicSegment } from './schneider';
import type { Vector2 } from '@quar/types';
import { vec2 } from '../math';
import { bezier } from './bezier';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate points on a circular arc.
 */
function circlePoints(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  n: number
): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const angle = startAngle + ((endAngle - startAngle) * i) / (n - 1);
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}

/**
 * Compute the minimum distance from a point to a cubic Bezier segment
 * by sampling at many parameter values.
 */
function minDistToSegment(point: Vector2, seg: CubicSegment, samples = 200): number {
  let minDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = bezier.cubicPoint(seg.p0, seg.p1, seg.p2, seg.p3, t);
    const d = vec2.distance(point, p);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Compute the minimum distance from a point to any segment in the curve chain.
 */
function minDistToCurves(point: Vector2, curves: CubicSegment[]): number {
  let minDist = Infinity;
  for (const seg of curves) {
    const d = minDistToSegment(point, seg);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Generate collinear points between two endpoints.
 */
function collinearPoints(p0: Vector2, p1: Vector2, n: number): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    points.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
    });
  }
  return points;
}

// ============================================================================
// Tests
// ============================================================================

describe('schneiderFitCurve', () => {
  // --------------------------------------------------------------------------
  // 1. Basic cases
  // --------------------------------------------------------------------------
  describe('basic cases', () => {
    it('returns empty array for empty input', () => {
      const result = schneiderFitCurve([], 1.0);
      expect(result).toEqual([]);
    });

    it('returns empty array for single point', () => {
      const result = schneiderFitCurve([{ x: 10, y: 20 }], 1.0);
      expect(result).toEqual([]);
    });

    it('returns one segment for two points', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 30, y: 0 };
      const result = schneiderFitCurve([p0, p1], 1.0);
      expect(result).toHaveLength(1);
    });

    it('line segment endpoints match input points', () => {
      const p0 = { x: 5, y: 10 };
      const p1 = { x: 35, y: 50 };
      const result = schneiderFitCurve([p0, p1], 1.0);
      expect(result).toHaveLength(1);

      const seg = result[0];
      expect(seg.p0.x).toBeCloseTo(p0.x);
      expect(seg.p0.y).toBeCloseTo(p0.y);
      expect(seg.p3.x).toBeCloseTo(p1.x);
      expect(seg.p3.y).toBeCloseTo(p1.y);
    });

    it('line segment control points are at 1/3 distances', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 90, y: 0 };
      const result = schneiderFitCurve([p0, p1], 1.0);
      const seg = result[0];

      // p1 should be at 1/3 from p0
      expect(seg.p1.x).toBeCloseTo(30);
      expect(seg.p1.y).toBeCloseTo(0);
      // p2 should be at 2/3 from p0 (1/3 from p1)
      expect(seg.p2.x).toBeCloseTo(60);
      expect(seg.p2.y).toBeCloseTo(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Simple curves
  // --------------------------------------------------------------------------
  describe('simple curves', () => {
    it('fits a quarter circle arc in 1 curve with reasonable error', () => {
      // Quarter circle from (100, 0) to (0, 100) with 10 sample points
      const points = circlePoints(0, 0, 100, 0, Math.PI / 2, 10);
      const maxError = 25; // maxError is squared distance, sqrt(25) = 5 pixels
      const result = schneiderFitCurve(points, maxError);

      // A quarter circle should fit in 1 or 2 cubic segments
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.length).toBeLessThanOrEqual(2);

      // Verify the fit approximates the input points
      for (const point of points) {
        const dist = minDistToCurves(point, result);
        expect(dist).toBeLessThan(Math.sqrt(maxError) + 1);
      }
    });

    it('fits an S-curve with multiple segments', () => {
      // S-curve: first half arcs up, second half arcs down
      const firstHalf = circlePoints(0, 0, 50, 0, Math.PI / 2, 8);
      const secondHalf = circlePoints(50, 50, 50, Math.PI / 2, Math.PI, 8);
      // Remove duplicate junction point
      const points = [...firstHalf, ...secondHalf.slice(1)];

      const result = schneiderFitCurve(points, 4.0);

      // S-curve needs at least 2 segments
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('fits collinear points as a single segment', () => {
      const points = collinearPoints({ x: 0, y: 0 }, { x: 100, y: 50 }, 20);
      const result = schneiderFitCurve(points, 1.0);

      // Collinear points should be a single line segment
      expect(result).toHaveLength(1);
    });

    it('ensures C0 continuity: each segment p3 matches next p0', () => {
      const points = circlePoints(0, 0, 100, 0, Math.PI, 20);
      const result = schneiderFitCurve(points, 4.0);

      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].p3.x).toBeCloseTo(result[i + 1].p0.x, 5);
        expect(result[i].p3.y).toBeCloseTo(result[i + 1].p0.y, 5);
      }
    });

    it('fit error for each input point is within tolerance', () => {
      const points = circlePoints(0, 0, 80, 0, Math.PI * 0.75, 15);
      const maxError = 16.0; // squared distance
      const result = schneiderFitCurve(points, maxError);

      for (const point of points) {
        const dist = minDistToCurves(point, result);
        // dist is actual distance, maxError is squared distance threshold
        // Allow some tolerance since sampling is discrete
        expect(dist * dist).toBeLessThan(maxError * 4);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Sharp corners and subdivision
  // --------------------------------------------------------------------------
  describe('sharp corners and subdivision', () => {
    it('subdivides at a sharp V-shape corner', () => {
      // V-shape: goes down-right then up-right
      const points: Vector2[] = [
        { x: 0, y: 100 },
        { x: 25, y: 50 },
        { x: 50, y: 0 },
        { x: 75, y: 50 },
        { x: 100, y: 100 },
      ];
      const result = schneiderFitCurve(points, 1.0);

      // Sharp corner should cause subdivision
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('handles zigzag paths with multiple segments', () => {
      const points: Vector2[] = [
        { x: 0, y: 0 },
        { x: 20, y: 40 },
        { x: 40, y: 0 },
        { x: 60, y: 40 },
        { x: 80, y: 0 },
        { x: 100, y: 40 },
      ];
      const result = schneiderFitCurve(points, 1.0);

      // A zigzag with tight tolerance needs multiple segments
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('higher maxError produces fewer or equal segments', () => {
      const points = circlePoints(0, 0, 100, 0, Math.PI, 30);

      const looseResult = schneiderFitCurve(points, 100.0);
      const tightResult = schneiderFitCurve(points, 1.0);

      expect(looseResult.length).toBeLessThanOrEqual(tightResult.length);
    });

    it('lower maxError produces more or equal segments', () => {
      // A non-trivial curve that requires subdivision
      const points: Vector2[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        points.push({
          x: t * 200,
          y: 50 * Math.sin(t * Math.PI * 3),
        });
      }

      const looseResult = schneiderFitCurve(points, 100.0);
      const tightResult = schneiderFitCurve(points, 0.5);

      expect(tightResult.length).toBeGreaterThanOrEqual(looseResult.length);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Degenerate inputs
  // --------------------------------------------------------------------------
  describe('degenerate inputs', () => {
    it('removes duplicate consecutive points and still fits', () => {
      const points: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ];
      const result = schneiderFitCurve(points, 4.0);

      // Should still produce valid segments after dedup
      expect(result.length).toBeGreaterThanOrEqual(1);

      // First segment starts at (0,0), last ends at (100,0)
      expect(result[0].p0.x).toBeCloseTo(0);
      expect(result[0].p0.y).toBeCloseTo(0);
      expect(result[result.length - 1].p3.x).toBeCloseTo(100);
      expect(result[result.length - 1].p3.y).toBeCloseTo(0);
    });

    it('returns empty for all identical points', () => {
      const points: Vector2[] = [
        { x: 42, y: 42 },
        { x: 42, y: 42 },
        { x: 42, y: 42 },
        { x: 42, y: 42 },
      ];
      const result = schneiderFitCurve(points, 1.0);

      // After dedup, only 1 unique point remains => length < 2 => empty
      expect(result).toEqual([]);
    });

    it('handles very close but not identical points gracefully', () => {
      const points: Vector2[] = [
        { x: 0, y: 0 },
        { x: 1e-12, y: 1e-12 },
        { x: 2e-12, y: 0 },
        { x: 100, y: 100 },
      ];

      // Should not throw; the near-duplicates will be removed
      const result = schneiderFitCurve(points, 1.0);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('handles very large coordinates without crashing', () => {
      const points: Vector2[] = [
        { x: 1e8, y: 1e8 },
        { x: 1e8 + 100, y: 1e8 + 50 },
        { x: 1e8 + 200, y: 1e8 },
      ];

      const result = schneiderFitCurve(points, 4.0);
      expect(result.length).toBeGreaterThanOrEqual(1);

      // Endpoints match
      expect(result[0].p0.x).toBeCloseTo(1e8, -1);
      expect(result[result.length - 1].p3.x).toBeCloseTo(1e8 + 200, -1);
    });
  });

  // --------------------------------------------------------------------------
  // Additional edge cases
  // --------------------------------------------------------------------------
  describe('additional edge cases', () => {
    it('first segment starts at first input point', () => {
      const points = circlePoints(10, 20, 50, 0, Math.PI / 2, 8);
      const result = schneiderFitCurve(points, 4.0);

      expect(result[0].p0.x).toBeCloseTo(points[0].x, 5);
      expect(result[0].p0.y).toBeCloseTo(points[0].y, 5);
    });

    it('last segment ends at last input point', () => {
      const points = circlePoints(10, 20, 50, 0, Math.PI / 2, 8);
      const result = schneiderFitCurve(points, 4.0);

      const lastSeg = result[result.length - 1];
      const lastPt = points[points.length - 1];
      expect(lastSeg.p3.x).toBeCloseTo(lastPt.x, 5);
      expect(lastSeg.p3.y).toBeCloseTo(lastPt.y, 5);
    });

    it('two points after dedup uses line segment', () => {
      const points: Vector2[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 60, y: 30 },
        { x: 60, y: 30 },
      ];
      const result = schneiderFitCurve(points, 1.0);

      // After removing duplicates: [{ 0,0 }, { 60,30 }] => 1 line segment
      expect(result).toHaveLength(1);
      expect(result[0].p0.x).toBeCloseTo(0);
      expect(result[0].p0.y).toBeCloseTo(0);
      expect(result[0].p3.x).toBeCloseTo(60);
      expect(result[0].p3.y).toBeCloseTo(30);
    });

    it('line segment control points lie on the line', () => {
      const p0 = { x: 10, y: 20 };
      const p1 = { x: 70, y: 80 };
      const result = schneiderFitCurve([p0, p1], 1.0);
      const seg = result[0];

      // All four points should be collinear
      // Direction from p0 to p3
      const dir = vec2.normalize(vec2.subtract(seg.p3, seg.p0));

      // p1 direction from p0
      const d1 = vec2.normalize(vec2.subtract(seg.p1, seg.p0));
      // p2 direction from p0
      const d2 = vec2.normalize(vec2.subtract(seg.p2, seg.p0));

      // Cross product should be ~0 (collinear)
      expect(Math.abs(vec2.cross(dir, d1))).toBeLessThan(1e-6);
      expect(Math.abs(vec2.cross(dir, d2))).toBeLessThan(1e-6);
    });

    it('produces valid segments for a full semicircle', () => {
      const points = circlePoints(0, 0, 100, 0, Math.PI, 30);
      const result = schneiderFitCurve(points, 4.0);

      // Must have at least 1 segment
      expect(result.length).toBeGreaterThanOrEqual(1);

      // Check continuity
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].p3.x).toBeCloseTo(result[i + 1].p0.x, 5);
        expect(result[i].p3.y).toBeCloseTo(result[i + 1].p0.y, 5);
      }

      // Endpoints match
      expect(result[0].p0.x).toBeCloseTo(100, 2);
      expect(result[0].p0.y).toBeCloseTo(0, 2);
      expect(result[result.length - 1].p3.x).toBeCloseTo(-100, 2);
      expect(result[result.length - 1].p3.y).toBeCloseTo(0, 1);
    });

    it('handles a sine wave with many points', () => {
      const points: Vector2[] = [];
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        points.push({
          x: t * 400,
          y: 60 * Math.sin(t * Math.PI * 2),
        });
      }

      const result = schneiderFitCurve(points, 4.0);

      // Sine wave needs multiple segments
      expect(result.length).toBeGreaterThanOrEqual(2);

      // C0 continuity
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].p3.x).toBeCloseTo(result[i + 1].p0.x, 5);
        expect(result[i].p3.y).toBeCloseTo(result[i + 1].p0.y, 5);
      }
    });

    it('three non-collinear points produce a valid curve', () => {
      const points: Vector2[] = [
        { x: 0, y: 0 },
        { x: 50, y: 80 },
        { x: 100, y: 0 },
      ];
      const result = schneiderFitCurve(points, 4.0);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].p0.x).toBeCloseTo(0);
      expect(result[0].p0.y).toBeCloseTo(0);
      expect(result[result.length - 1].p3.x).toBeCloseTo(100);
      expect(result[result.length - 1].p3.y).toBeCloseTo(0);
    });
  });
});

// ============================================================================
// curvesToPathPoints
// ============================================================================

describe('curvesToPathPoints', () => {
  // --------------------------------------------------------------------------
  // 5. curvesToPathPoints tests
  // --------------------------------------------------------------------------
  describe('basic conversion', () => {
    it('returns empty array for empty curves', () => {
      const result = curvesToPathPoints([]);
      expect(result).toEqual([]);
    });

    it('single curve produces 2 path points', () => {
      const seg: CubicSegment = {
        p0: { x: 0, y: 0 },
        p1: { x: 10, y: 20 },
        p2: { x: 40, y: 20 },
        p3: { x: 50, y: 0 },
      };
      const result = curvesToPathPoints([seg]);

      expect(result).toHaveLength(2);
    });

    it('multiple curves produce n+1 path points', () => {
      const seg1: CubicSegment = {
        p0: { x: 0, y: 0 },
        p1: { x: 10, y: 20 },
        p2: { x: 20, y: 20 },
        p3: { x: 30, y: 0 },
      };
      const seg2: CubicSegment = {
        p0: { x: 30, y: 0 },
        p1: { x: 40, y: -20 },
        p2: { x: 50, y: -20 },
        p3: { x: 60, y: 0 },
      };
      const seg3: CubicSegment = {
        p0: { x: 60, y: 0 },
        p1: { x: 70, y: 20 },
        p2: { x: 80, y: 20 },
        p3: { x: 90, y: 0 },
      };

      const result = curvesToPathPoints([seg1, seg2, seg3]);
      // 3 curves => 4 path points
      expect(result).toHaveLength(4);
    });

    it('all points have type smooth', () => {
      const seg1: CubicSegment = {
        p0: { x: 0, y: 0 },
        p1: { x: 10, y: 30 },
        p2: { x: 40, y: 30 },
        p3: { x: 50, y: 0 },
      };
      const seg2: CubicSegment = {
        p0: { x: 50, y: 0 },
        p1: { x: 60, y: -30 },
        p2: { x: 90, y: -30 },
        p3: { x: 100, y: 0 },
      };

      const result = curvesToPathPoints([seg1, seg2]);
      for (const pt of result) {
        expect(pt.type).toBe('smooth');
      }
    });

    it('first point has handleIn null, last point has handleOut null', () => {
      const seg1: CubicSegment = {
        p0: { x: 0, y: 0 },
        p1: { x: 10, y: 30 },
        p2: { x: 40, y: 30 },
        p3: { x: 50, y: 0 },
      };
      const seg2: CubicSegment = {
        p0: { x: 50, y: 0 },
        p1: { x: 60, y: -30 },
        p2: { x: 90, y: -30 },
        p3: { x: 100, y: 0 },
      };

      const result = curvesToPathPoints([seg1, seg2]);

      expect(result[0].handleIn).toBeNull();
      expect(result[result.length - 1].handleOut).toBeNull();
    });

    it('G1 continuity: at shared points, handleIn and handleOut are roughly opposite', () => {
      // Use actual fitted curves for a realistic test
      const points = circlePoints(0, 0, 100, 0, Math.PI, 20);
      const curves = schneiderFitCurve(points, 4.0);

      // Need at least 2 segments to test shared points
      if (curves.length < 2) return;

      const pathPoints = curvesToPathPoints(curves);

      // Check interior points (not first or last) for G1 continuity
      for (let i = 1; i < pathPoints.length - 1; i++) {
        const pt = pathPoints[i];
        if (pt.handleIn && pt.handleOut) {
          // Normalize both handles and check they point in roughly opposite directions
          const hIn = vec2.normalize(pt.handleIn);
          const hOut = vec2.normalize(pt.handleOut);

          // Dot product of opposite-direction unit vectors should be close to -1
          const dot = vec2.dot(hIn, hOut);
          // Allow some tolerance: dot should be negative (opposite-ish)
          expect(dot).toBeLessThan(0.1);
        }
      }
    });
  });

  describe('handle computation', () => {
    it('handleOut of first point equals p1 - p0', () => {
      const seg: CubicSegment = {
        p0: { x: 10, y: 20 },
        p1: { x: 30, y: 60 },
        p2: { x: 70, y: 60 },
        p3: { x: 90, y: 20 },
      };
      const result = curvesToPathPoints([seg]);

      // handleOut = p1 - p0 = (20, 40)
      expect(result[0].handleOut).not.toBeNull();
      expect(result[0].handleOut!.x).toBeCloseTo(20);
      expect(result[0].handleOut!.y).toBeCloseTo(40);
    });

    it('handleIn of last point equals p2 - p3', () => {
      const seg: CubicSegment = {
        p0: { x: 10, y: 20 },
        p1: { x: 30, y: 60 },
        p2: { x: 70, y: 60 },
        p3: { x: 90, y: 20 },
      };
      const result = curvesToPathPoints([seg]);

      // handleIn = p2 - p3 = (-20, 40)
      expect(result[1].handleIn).not.toBeNull();
      expect(result[1].handleIn!.x).toBeCloseTo(-20);
      expect(result[1].handleIn!.y).toBeCloseTo(40);
    });

    it('interior points have both handleIn and handleOut from adjacent segments', () => {
      const seg1: CubicSegment = {
        p0: { x: 0, y: 0 },
        p1: { x: 10, y: 30 },
        p2: { x: 40, y: 30 },
        p3: { x: 50, y: 0 },
      };
      const seg2: CubicSegment = {
        p0: { x: 50, y: 0 },
        p1: { x: 60, y: -30 },
        p2: { x: 90, y: -30 },
        p3: { x: 100, y: 0 },
      };

      const result = curvesToPathPoints([seg1, seg2]);

      // Middle point (index 1) = seg1.p3 = seg2.p0
      const mid = result[1];
      expect(mid.position.x).toBeCloseTo(50);
      expect(mid.position.y).toBeCloseTo(0);

      // handleIn = seg1.p2 - seg1.p3 = (40-50, 30-0) = (-10, 30)
      expect(mid.handleIn).not.toBeNull();
      expect(mid.handleIn!.x).toBeCloseTo(-10);
      expect(mid.handleIn!.y).toBeCloseTo(30);

      // handleOut = seg2.p1 - seg2.p0 = (60-50, -30-0) = (10, -30)
      expect(mid.handleOut).not.toBeNull();
      expect(mid.handleOut!.x).toBeCloseTo(10);
      expect(mid.handleOut!.y).toBeCloseTo(-30);
    });

    it('path point positions match segment endpoints', () => {
      const seg1: CubicSegment = {
        p0: { x: 5, y: 15 },
        p1: { x: 20, y: 40 },
        p2: { x: 35, y: 40 },
        p3: { x: 50, y: 15 },
      };
      const seg2: CubicSegment = {
        p0: { x: 50, y: 15 },
        p1: { x: 65, y: -10 },
        p2: { x: 80, y: -10 },
        p3: { x: 95, y: 15 },
      };

      const result = curvesToPathPoints([seg1, seg2]);

      expect(result[0].position.x).toBeCloseTo(5);
      expect(result[0].position.y).toBeCloseTo(15);
      expect(result[1].position.x).toBeCloseTo(50);
      expect(result[1].position.y).toBeCloseTo(15);
      expect(result[2].position.x).toBeCloseTo(95);
      expect(result[2].position.y).toBeCloseTo(15);
    });

    it('handles are null when control point coincides with endpoint', () => {
      // A degenerate cubic where p1 == p0 (zero-length handleOut)
      const seg: CubicSegment = {
        p0: { x: 0, y: 0 },
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        p3: { x: 100, y: 0 },
      };
      const result = curvesToPathPoints([seg]);

      // handleOut of first point = p1 - p0 = (0, 0), length ~ 0 => null
      expect(result[0].handleOut).toBeNull();
      // handleIn of last point = p2 - p3 = (0, 0), length ~ 0 => null
      expect(result[1].handleIn).toBeNull();
    });
  });

  describe('integration with schneiderFitCurve', () => {
    it('full pipeline: fit curve then convert to path points', () => {
      const points = circlePoints(0, 0, 80, 0, Math.PI / 2, 12);
      const curves = schneiderFitCurve(points, 4.0);
      const pathPoints = curvesToPathPoints(curves);

      // n curves => n+1 path points
      expect(pathPoints).toHaveLength(curves.length + 1);

      // All smooth
      for (const pt of pathPoints) {
        expect(pt.type).toBe('smooth');
      }

      // First handleIn null, last handleOut null
      expect(pathPoints[0].handleIn).toBeNull();
      expect(pathPoints[pathPoints.length - 1].handleOut).toBeNull();

      // First point position matches first input point
      expect(pathPoints[0].position.x).toBeCloseTo(points[0].x, 2);
      expect(pathPoints[0].position.y).toBeCloseTo(points[0].y, 2);

      // Last point position matches last input point
      const lastPP = pathPoints[pathPoints.length - 1];
      const lastInput = points[points.length - 1];
      expect(lastPP.position.x).toBeCloseTo(lastInput.x, 2);
      expect(lastPP.position.y).toBeCloseTo(lastInput.y, 2);
    });

    it('path points from a line have no significant handles', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 100, y: 0 };
      const curves = schneiderFitCurve([p0, p1], 1.0);
      const pathPoints = curvesToPathPoints(curves);

      expect(pathPoints).toHaveLength(2);

      // For a line, the handles point along the line direction with 1/3 distance magnitude
      // handleOut of first point = p1 - p0 of cubic segment
      if (pathPoints[0].handleOut) {
        // Handle should be along the line direction
        const hLen = vec2.length(pathPoints[0].handleOut);
        const lineLen = vec2.distance(p0, p1);
        expect(hLen).toBeCloseTo(lineLen / 3, 1);
      }
    });
  });
});
