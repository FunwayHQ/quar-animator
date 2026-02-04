/**
 * Tests for Bezier Curve Utilities
 */

import { describe, it, expect } from 'vitest';
import { bezier } from './bezier';
import type { Vector2 } from '@quar/types';

// Helper to check if two vectors are approximately equal
const expectVecNear = (actual: Vector2, expected: Vector2, epsilon = 0.0001) => {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
};

describe('bezier', () => {
  // ==========================================================================
  // Cubic Point Evaluation
  // ==========================================================================

  describe('cubicPoint', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should return p0 at t=0', () => {
      const result = bezier.cubicPoint(p0, p1, p2, p3, 0);
      expectVecNear(result, p0);
    });

    it('should return p3 at t=1', () => {
      const result = bezier.cubicPoint(p0, p1, p2, p3, 1);
      expectVecNear(result, p3);
    });

    it('should return midpoint approximately at t=0.5', () => {
      const result = bezier.cubicPoint(p0, p1, p2, p3, 0.5);
      // For this symmetric S-curve, midpoint should be at (50, 75)
      expect(result.x).toBeCloseTo(50, 1);
      expect(result.y).toBeCloseTo(75, 1);
    });

    it('should handle linear bezier (all control points on line)', () => {
      // Use exact thirds for truly linear bezier
      const linear = [
        { x: 0, y: 0 },
        { x: 100 / 3, y: 100 / 3 },
        { x: 200 / 3, y: 200 / 3 },
        { x: 100, y: 100 },
      ];
      const result = bezier.cubicPoint(linear[0], linear[1], linear[2], linear[3], 0.5);
      expect(result.x).toBeCloseTo(50, 1);
      expect(result.y).toBeCloseTo(50, 1);
    });

    it('should return correct point at t=0.25', () => {
      const result = bezier.cubicPoint(p0, p1, p2, p3, 0.25);
      expect(result.x).toBeGreaterThan(0);
      expect(result.x).toBeLessThan(50);
      expect(result.y).toBeGreaterThan(0);
    });

    it('should return correct point at t=0.75', () => {
      const result = bezier.cubicPoint(p0, p1, p2, p3, 0.75);
      expect(result.x).toBeGreaterThan(50);
      expect(result.x).toBeLessThan(100);
    });

    it('should handle negative coordinates', () => {
      const neg = [
        { x: -100, y: -100 },
        { x: -50, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: -100 },
      ];
      const result = bezier.cubicPoint(neg[0], neg[1], neg[2], neg[3], 0.5);
      expect(result.x).toBeCloseTo(0, 1);
    });
  });

  // ==========================================================================
  // Quadratic Point Evaluation
  // ==========================================================================

  describe('quadraticPoint', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };

    it('should return p0 at t=0', () => {
      const result = bezier.quadraticPoint(p0, p1, p2, 0);
      expectVecNear(result, p0);
    });

    it('should return p2 at t=1', () => {
      const result = bezier.quadraticPoint(p0, p1, p2, 1);
      expectVecNear(result, p2);
    });

    it('should return correct midpoint at t=0.5', () => {
      const result = bezier.quadraticPoint(p0, p1, p2, 0.5);
      // Quadratic midpoint formula: (P0 + 2P1 + P2) / 4
      expectVecNear(result, { x: 50, y: 50 });
    });

    it('should handle horizontal line', () => {
      const horiz = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];
      const result = bezier.quadraticPoint(horiz[0], horiz[1], horiz[2], 0.5);
      expectVecNear(result, { x: 50, y: 0 });
    });
  });

  // ==========================================================================
  // Cubic Derivative
  // ==========================================================================

  describe('cubicDerivative', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should return tangent at t=0', () => {
      const result = bezier.cubicDerivative(p0, p1, p2, p3, 0);
      // Derivative at t=0 is 3(P1-P0)
      expectVecNear(result, { x: 0, y: 300 });
    });

    it('should return tangent at t=1', () => {
      const result = bezier.cubicDerivative(p0, p1, p2, p3, 1);
      // Derivative at t=1 is 3(P3-P2)
      expectVecNear(result, { x: 0, y: -300 });
    });

    it('should return non-zero tangent at t=0.5', () => {
      const result = bezier.cubicDerivative(p0, p1, p2, p3, 0.5);
      expect(result.x).not.toBe(0);
    });
  });

  // ==========================================================================
  // Subdivide
  // ==========================================================================

  describe('subdivide', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should return two curves at t=0.5', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.5);

      // Left curve should start at p0
      expectVecNear(left.p0, p0);

      // Right curve should end at p3
      expectVecNear(right.p3, p3);

      // Both should meet at the midpoint
      expectVecNear(left.p3, right.p0);
    });

    it('should preserve continuity at split point', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.5);
      expectVecNear(left.p3, right.p0);
    });

    it('should maintain curve shape (points on subdivided curves match original)', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.5);

      // Point at t=0.25 on original should equal t=0.5 on left segment
      const origPoint = bezier.cubicPoint(p0, p1, p2, p3, 0.25);
      const leftPoint = bezier.cubicPoint(left.p0, left.p1, left.p2, left.p3, 0.5);
      expectVecNear(origPoint, leftPoint);
    });

    it('should work at t=0.25', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.25);
      expectVecNear(left.p0, p0);
      expectVecNear(right.p3, p3);
    });

    it('should work at t=0.75', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.75);
      expectVecNear(left.p0, p0);
      expectVecNear(right.p3, p3);
    });

    it('should handle t=0 edge case', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0);
      expectVecNear(left.p0, left.p3); // Degenerate left curve
    });

    it('should handle t=1 edge case', () => {
      const [left, right] = bezier.subdivide(p0, p1, p2, p3, 1);
      expectVecNear(right.p0, right.p3); // Degenerate right curve
    });
  });

  // ==========================================================================
  // Tessellate
  // ==========================================================================

  describe('tessellate', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should return array starting with p0', () => {
      const points = bezier.tessellate(p0, p1, p2, p3, 1);
      expectVecNear(points[0], p0);
    });

    it('should return array ending with p3', () => {
      const points = bezier.tessellate(p0, p1, p2, p3, 1);
      expectVecNear(points[points.length - 1], p3);
    });

    it('should return at least 2 points', () => {
      const points = bezier.tessellate(p0, p1, p2, p3, 100);
      expect(points.length).toBeGreaterThanOrEqual(2);
    });

    it('should return more points with lower tolerance', () => {
      const coarse = bezier.tessellate(p0, p1, p2, p3, 10);
      const fine = bezier.tessellate(p0, p1, p2, p3, 0.1);
      expect(fine.length).toBeGreaterThan(coarse.length);
    });

    it('should handle straight line efficiently', () => {
      const line = [
        { x: 0, y: 0 },
        { x: 33.33, y: 33.33 },
        { x: 66.67, y: 66.67 },
        { x: 100, y: 100 },
      ];
      const points = bezier.tessellate(line[0], line[1], line[2], line[3], 1);
      // Should be relatively few points for a straight line
      expect(points.length).toBeLessThan(20);
    });

    it('should produce points that are on the curve', () => {
      const points = bezier.tessellate(p0, p1, p2, p3, 1);
      // Check that each point is close to the curve
      for (const point of points) {
        const nearest = bezier.nearestPoint(p0, p1, p2, p3, point);
        expect(nearest.distance).toBeLessThan(2);
      }
    });
  });

  // ==========================================================================
  // Tessellate Quadratic
  // ==========================================================================

  describe('tessellateQuadratic', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };

    it('should return array starting with p0', () => {
      const points = bezier.tessellateQuadratic(p0, p1, p2, 1);
      expectVecNear(points[0], p0);
    });

    it('should return array ending with p2', () => {
      const points = bezier.tessellateQuadratic(p0, p1, p2, 1);
      expectVecNear(points[points.length - 1], p2);
    });

    it('should return at least 2 points', () => {
      const points = bezier.tessellateQuadratic(p0, p1, p2, 100);
      expect(points.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Bounds
  // ==========================================================================

  describe('bounds', () => {
    it('should compute correct bounds for simple curve', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 0, y: 100 };
      const p2 = { x: 100, y: 100 };
      const p3 = { x: 100, y: 0 };

      const bounds = bezier.bounds(p0, p1, p2, p3);

      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBeGreaterThan(50); // Curve bulges above y=0
    });

    it('should handle linear curve', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 33.33, y: 33.33 };
      const p2 = { x: 66.67, y: 66.67 };
      const p3 = { x: 100, y: 100 };

      const bounds = bezier.bounds(p0, p1, p2, p3);

      expect(bounds.x).toBeCloseTo(0);
      expect(bounds.y).toBeCloseTo(0);
      expect(bounds.width).toBeCloseTo(100);
      expect(bounds.height).toBeCloseTo(100);
    });

    it('should handle curve with extrema outside endpoints', () => {
      // Curve that bulges beyond its endpoints
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 100, y: 200 };
      const p2 = { x: 200, y: -100 };
      const p3 = { x: 100, y: 0 };

      const bounds = bezier.bounds(p0, p1, p2, p3);

      // Y should extend beyond the endpoints
      expect(bounds.y).toBeLessThan(0);
      expect(bounds.y + bounds.height).toBeGreaterThan(0);
    });

    it('should return zero-size bounds for point curve', () => {
      const p = { x: 50, y: 50 };
      const bounds = bezier.bounds(p, p, p, p);

      expect(bounds.x).toBe(50);
      expect(bounds.y).toBe(50);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const p0 = { x: -100, y: -100 };
      const p1 = { x: -50, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 100, y: -100 };

      const bounds = bezier.bounds(p0, p1, p2, p3);

      expect(bounds.x).toBe(-100);
      expect(bounds.width).toBe(200);
    });
  });

  // ==========================================================================
  // Nearest Point
  // ==========================================================================

  describe('nearestPoint', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should find point on curve closest to query point', () => {
      const queryPoint = { x: 50, y: 50 };
      const result = bezier.nearestPoint(p0, p1, p2, p3, queryPoint);

      expect(result.t).toBeGreaterThan(0);
      expect(result.t).toBeLessThan(1);
      expect(result.distance).toBeGreaterThan(0);
    });

    it('should return t=0 for point nearest to p0', () => {
      const queryPoint = { x: -10, y: -10 };
      const result = bezier.nearestPoint(p0, p1, p2, p3, queryPoint);

      expect(result.t).toBeCloseTo(0, 1);
      expectVecNear(result.point, p0);
    });

    it('should return t=1 for point nearest to p3', () => {
      const queryPoint = { x: 110, y: -10 };
      const result = bezier.nearestPoint(p0, p1, p2, p3, queryPoint);

      expect(result.t).toBeCloseTo(1, 1);
      expectVecNear(result.point, p3);
    });

    it('should return zero distance for point on curve', () => {
      const midpoint = bezier.cubicPoint(p0, p1, p2, p3, 0.5);
      const result = bezier.nearestPoint(p0, p1, p2, p3, midpoint);

      expect(result.distance).toBeLessThan(0.01);
    });

    it('should handle point exactly at endpoint', () => {
      const result = bezier.nearestPoint(p0, p1, p2, p3, p0);
      expect(result.distance).toBeLessThan(0.01);
    });

    it('should return reasonable t value for point far from curve', () => {
      const farPoint = { x: 1000, y: 1000 };
      const result = bezier.nearestPoint(p0, p1, p2, p3, farPoint);

      expect(result.t).toBeGreaterThanOrEqual(0);
      expect(result.t).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Quadratic to Cubic Conversion
  // ==========================================================================

  describe('quadraticToCubic', () => {
    it('should convert quadratic to equivalent cubic', () => {
      const qp0 = { x: 0, y: 0 };
      const qp1 = { x: 50, y: 100 };
      const qp2 = { x: 100, y: 0 };

      const cubic = bezier.quadraticToCubic(qp0, qp1, qp2);

      // Endpoints should match
      expectVecNear(cubic.p0, qp0);
      expectVecNear(cubic.p3, qp2);

      // Midpoints should match
      const quadMid = bezier.quadraticPoint(qp0, qp1, qp2, 0.5);
      const cubicMid = bezier.cubicPoint(cubic.p0, cubic.p1, cubic.p2, cubic.p3, 0.5);
      expectVecNear(quadMid, cubicMid);
    });

    it('should preserve curve shape at multiple t values', () => {
      const qp0 = { x: 0, y: 0 };
      const qp1 = { x: 50, y: 100 };
      const qp2 = { x: 100, y: 0 };

      const cubic = bezier.quadraticToCubic(qp0, qp1, qp2);

      for (const t of [0.25, 0.5, 0.75]) {
        const quadPoint = bezier.quadraticPoint(qp0, qp1, qp2, t);
        const cubicPoint = bezier.cubicPoint(cubic.p0, cubic.p1, cubic.p2, cubic.p3, t);
        expectVecNear(quadPoint, cubicPoint);
      }
    });
  });

  // ==========================================================================
  // Split At Multiple
  // ==========================================================================

  describe('splitAtMultiple', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should return original curve when no t values provided', () => {
      const curves = bezier.splitAtMultiple(p0, p1, p2, p3, []);
      expect(curves.length).toBe(1);
      expectVecNear(curves[0].p0, p0);
      expectVecNear(curves[0].p3, p3);
    });

    it('should split into two curves at single t value', () => {
      const curves = bezier.splitAtMultiple(p0, p1, p2, p3, [0.5]);
      expect(curves.length).toBe(2);

      expectVecNear(curves[0].p0, p0);
      expectVecNear(curves[1].p3, p3);
      expectVecNear(curves[0].p3, curves[1].p0);
    });

    it('should split into three curves at two t values', () => {
      const curves = bezier.splitAtMultiple(p0, p1, p2, p3, [0.33, 0.66]);
      expect(curves.length).toBe(3);

      // First and last should connect to endpoints
      expectVecNear(curves[0].p0, p0);
      expectVecNear(curves[2].p3, p3);

      // Intermediate curves should connect
      expectVecNear(curves[0].p3, curves[1].p0);
      expectVecNear(curves[1].p3, curves[2].p0);
    });

    it('should handle unsorted t values', () => {
      const curves = bezier.splitAtMultiple(p0, p1, p2, p3, [0.66, 0.33]);
      expect(curves.length).toBe(3);
    });

    it('should ignore t=0 and t=1', () => {
      const curves = bezier.splitAtMultiple(p0, p1, p2, p3, [0, 0.5, 1]);
      expect(curves.length).toBe(2);
    });
  });

  // ==========================================================================
  // Cubic Length
  // ==========================================================================

  describe('cubicLength', () => {
    it('should compute length of straight line correctly', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 33.33, y: 33.33 };
      const p2 = { x: 66.67, y: 66.67 };
      const p3 = { x: 100, y: 100 };

      const length = bezier.cubicLength(p0, p1, p2, p3);
      const expectedLength = Math.sqrt(100 * 100 + 100 * 100);

      expect(length).toBeCloseTo(expectedLength, 0);
    });

    it('should compute reasonable length for curve', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 0, y: 100 };
      const p2 = { x: 100, y: 100 };
      const p3 = { x: 100, y: 0 };

      const length = bezier.cubicLength(p0, p1, p2, p3);

      // Should be longer than chord length (100)
      expect(length).toBeGreaterThan(100);
      // But shorter than control polygon length (100 + 100√2 + 100)
      expect(length).toBeLessThan(350);
    });

    it('should return 0 for point curve', () => {
      const p = { x: 50, y: 50 };
      const length = bezier.cubicLength(p, p, p, p);
      expect(length).toBeCloseTo(0, 1);
    });
  });

  // ==========================================================================
  // Second Derivative
  // ==========================================================================

  describe('cubicSecondDerivative', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };

    it('should return non-zero for curved bezier', () => {
      const result = bezier.cubicSecondDerivative(p0, p1, p2, p3, 0.5);
      expect(result.x !== 0 || result.y !== 0).toBe(true);
    });

    it('should return zero for linear bezier', () => {
      const linear = [
        { x: 0, y: 0 },
        { x: 33.33, y: 33.33 },
        { x: 66.67, y: 66.67 },
        { x: 100, y: 100 },
      ];
      const result = bezier.cubicSecondDerivative(
        linear[0],
        linear[1],
        linear[2],
        linear[3],
        0.5
      );
      expect(result.x).toBeCloseTo(0, 0);
      expect(result.y).toBeCloseTo(0, 0);
    });
  });
});
