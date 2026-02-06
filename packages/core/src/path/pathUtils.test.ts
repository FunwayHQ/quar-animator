/**
 * Tests for Path Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createCornerPoint,
  createSmoothPoint,
  createSymmetricPoint,
  clonePathPoint,
  forEachSegment,
  getAbsoluteControlPoints,
  getPathBounds,
  getSegmentBounds,
  tessellatePathToVertices,
  tessellatePathToPoints,
  tessellateSegment,
  reversePath,
  getPathLength,
  getSegmentLength,
  getPointOnPath,
  getTangentOnPath,
  getNearestPointOnPath,
  createRectanglePath,
  createEllipsePath,
  createPolygonPath,
  createStarPath,
  generateStrokeOutlineVertices,
} from './pathUtils';
import type { PathPoint } from '@quar/types';

// Helper to check if two numbers are approximately equal
const expectNear = (actual: number, expected: number, epsilon = 0.0001) => {
  expect(actual).toBeCloseTo(expected, 4);
};

describe('PathPoint Creation', () => {
  describe('createCornerPoint', () => {
    it('should create a corner point with no handles', () => {
      const point = createCornerPoint({ x: 100, y: 200 });
      expect(point.position).toEqual({ x: 100, y: 200 });
      expect(point.handleIn).toBeNull();
      expect(point.handleOut).toBeNull();
      expect(point.type).toBe('corner');
    });

    it('should create an independent copy of position', () => {
      const pos = { x: 50, y: 50 };
      const point = createCornerPoint(pos);
      pos.x = 100;
      expect(point.position.x).toBe(50);
    });
  });

  describe('createSmoothPoint', () => {
    it('should create a smooth point with handles', () => {
      const point = createSmoothPoint({ x: 100, y: 100 }, { x: 50, y: 0 });
      expect(point.position).toEqual({ x: 100, y: 100 });
      expect(point.handleOut).toEqual({ x: 50, y: 0 });
      // Note: -0 and 0 are considered different by toEqual, so check values directly
      expect(point.handleIn?.x).toBe(-50);
      expect(point.handleIn?.y).toBe(-0); // -0 is valid
      expect(point.type).toBe('smooth');
    });

    it('should accept custom handleIn', () => {
      const point = createSmoothPoint({ x: 100, y: 100 }, { x: 50, y: 0 }, { x: -30, y: 10 });
      expect(point.handleIn).toEqual({ x: -30, y: 10 });
    });
  });

  describe('createSymmetricPoint', () => {
    it('should create a symmetric point with mirrored handles', () => {
      const point = createSymmetricPoint({ x: 100, y: 100 }, { x: 50, y: 25 });
      expect(point.handleOut).toEqual({ x: 50, y: 25 });
      expect(point.handleIn).toEqual({ x: -50, y: -25 });
      expect(point.type).toBe('symmetric');
    });
  });

  describe('clonePathPoint', () => {
    it('should create a deep copy of a path point', () => {
      const original = createSmoothPoint({ x: 100, y: 100 }, { x: 50, y: 0 });
      const clone = clonePathPoint(original);

      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.position).not.toBe(original.position);
    });

    it('should handle null handles', () => {
      const original = createCornerPoint({ x: 100, y: 100 });
      const clone = clonePathPoint(original);

      expect(clone.handleIn).toBeNull();
      expect(clone.handleOut).toBeNull();
    });
  });
});

describe('Path Bounds', () => {
  describe('getPathBounds', () => {
    it('should return null for empty path', () => {
      const bounds = getPathBounds([], false);
      expect(bounds).toBeNull();
    });

    it('should return point bounds for single point path', () => {
      const points = [createCornerPoint({ x: 50, y: 100 })];
      const bounds = getPathBounds(points, false);
      expect(bounds).toEqual({ x: 50, y: 100, width: 0, height: 0 });
    });

    it('should calculate bounds for straight line path', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 100 })];
      const bounds = getPathBounds(points, false);
      expect(bounds?.x).toBe(0);
      expect(bounds?.y).toBe(0);
      expect(bounds?.width).toBe(100);
      expect(bounds?.height).toBe(100);
    });

    it('should calculate bounds for curved path', () => {
      const points = [
        createSmoothPoint({ x: 0, y: 0 }, { x: 0, y: 50 }),
        createSmoothPoint({ x: 100, y: 0 }, { x: 0, y: -50 }),
      ];
      const bounds = getPathBounds(points, false);
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThan(0); // Curve bulges
    });

    it('should include closing segment for closed paths', () => {
      const points = [
        createCornerPoint({ x: 0, y: 0 }),
        createCornerPoint({ x: 100, y: 0 }),
        createCornerPoint({ x: 100, y: 100 }),
      ];
      const openBounds = getPathBounds(points, false);
      const closedBounds = getPathBounds(points, true);
      // Both should have same bounds for this triangle
      expect(openBounds?.width).toBe(closedBounds?.width);
    });
  });

  describe('getSegmentBounds', () => {
    it('should calculate bounds for straight segment', () => {
      const p0 = createCornerPoint({ x: 0, y: 0 });
      const p1 = createCornerPoint({ x: 100, y: 100 });
      const bounds = getSegmentBounds(p0, p1);
      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(100);
    });

    it('should include curve extrema in bounds', () => {
      const p0 = createSmoothPoint({ x: 0, y: 0 }, { x: 0, y: 100 });
      const p1 = createSmoothPoint({ x: 100, y: 0 }, { x: 0, y: 100 });
      const bounds = getSegmentBounds(p0, p1);
      expect(bounds.height).toBeGreaterThan(0);
    });
  });
});

describe('Path Tessellation', () => {
  describe('tessellatePathToVertices', () => {
    it('should return empty array for empty path', () => {
      const vertices = tessellatePathToVertices([], false);
      expect(vertices.length).toBe(0);
    });

    it('should return single point for single-point path', () => {
      const points = [createCornerPoint({ x: 50, y: 100 })];
      const vertices = tessellatePathToVertices(points, false);
      expect(vertices.length).toBe(2);
      expect(vertices[0]).toBe(50);
      expect(vertices[1]).toBe(100);
    });

    it('should tessellate straight line path', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 100 })];
      const vertices = tessellatePathToVertices(points, false);
      expect(vertices.length).toBeGreaterThanOrEqual(4);
      // First point
      expect(vertices[0]).toBe(0);
      expect(vertices[1]).toBe(0);
      // Last point
      expect(vertices[vertices.length - 2]).toBe(100);
      expect(vertices[vertices.length - 1]).toBe(100);
    });

    it('should close path when closed=true', () => {
      const points = [
        createCornerPoint({ x: 0, y: 0 }),
        createCornerPoint({ x: 100, y: 0 }),
        createCornerPoint({ x: 50, y: 100 }),
      ];
      const vertices = tessellatePathToVertices(points, true);
      // Last point should equal first point
      const lastX = vertices[vertices.length - 2];
      const lastY = vertices[vertices.length - 1];
      expect(lastX).toBeCloseTo(0);
      expect(lastY).toBeCloseTo(0);
    });

    it('should produce more vertices for curved paths', () => {
      const straight = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const curved = [
        createSmoothPoint({ x: 0, y: 0 }, { x: 0, y: 50 }),
        createSmoothPoint({ x: 100, y: 0 }, { x: 0, y: -50 }),
      ];
      const straightVerts = tessellatePathToVertices(straight, false);
      const curvedVerts = tessellatePathToVertices(curved, false, 0.5);
      expect(curvedVerts.length).toBeGreaterThan(straightVerts.length);
    });
  });

  describe('tessellatePathToPoints', () => {
    it('should return Vector2 array', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 100 })];
      const result = tessellatePathToPoints(points, false);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]).toHaveProperty('x');
      expect(result[0]).toHaveProperty('y');
    });
  });

  describe('tessellateSegment', () => {
    it('should return two points for straight segment', () => {
      const p0 = createCornerPoint({ x: 0, y: 0 });
      const p1 = createCornerPoint({ x: 100, y: 100 });
      const points = tessellateSegment(p0, p1);
      expect(points.length).toBe(2);
    });

    it('should return multiple points for curved segment', () => {
      const p0 = createSmoothPoint({ x: 0, y: 0 }, { x: 0, y: 100 });
      const p1 = createSmoothPoint({ x: 100, y: 0 }, { x: 0, y: 100 });
      const points = tessellateSegment(p0, p1, 0.5);
      expect(points.length).toBeGreaterThan(2);
    });
  });
});

describe('Path Operations', () => {
  describe('reversePath', () => {
    it('should reverse point order', () => {
      const points = [
        createCornerPoint({ x: 0, y: 0 }),
        createCornerPoint({ x: 100, y: 0 }),
        createCornerPoint({ x: 100, y: 100 }),
      ];
      const reversed = reversePath(points);
      expect(reversed[0].position).toEqual({ x: 100, y: 100 });
      expect(reversed[2].position).toEqual({ x: 0, y: 0 });
    });

    it('should swap handles', () => {
      const points = [createSmoothPoint({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: -25, y: 0 })];
      const reversed = reversePath(points);
      expect(reversed[0].handleIn).toEqual({ x: 50, y: 0 });
      expect(reversed[0].handleOut).toEqual({ x: -25, y: 0 });
    });

    it('should not modify original path', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const reversed = reversePath(points);
      expect(points[0].position).toEqual({ x: 0, y: 0 });
    });
  });

  describe('getPathLength', () => {
    it('should return 0 for empty path', () => {
      expect(getPathLength([], false)).toBe(0);
    });

    it('should return 0 for single point', () => {
      const points = [createCornerPoint({ x: 50, y: 50 })];
      expect(getPathLength(points, false)).toBe(0);
    });

    it('should calculate straight line length', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const length = getPathLength(points, false);
      expect(length).toBeCloseTo(100, 0);
    });

    it('should include closing segment for closed paths', () => {
      const points = [
        createCornerPoint({ x: 0, y: 0 }),
        createCornerPoint({ x: 100, y: 0 }),
        createCornerPoint({ x: 100, y: 100 }),
      ];
      const openLength = getPathLength(points, false);
      const closedLength = getPathLength(points, true);
      expect(closedLength).toBeGreaterThan(openLength);
    });
  });

  describe('getPointOnPath', () => {
    it('should return null for empty path', () => {
      expect(getPointOnPath([], false, 0.5)).toBeNull();
    });

    it('should return point for single-point path', () => {
      const points = [createCornerPoint({ x: 50, y: 100 })];
      const result = getPointOnPath(points, false, 0.5);
      expect(result).toEqual({ x: 50, y: 100 });
    });

    it('should return start point at t=0', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 100 })];
      const result = getPointOnPath(points, false, 0);
      expect(result?.x).toBeCloseTo(0);
      expect(result?.y).toBeCloseTo(0);
    });

    it('should return end point at t=1', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 100 })];
      const result = getPointOnPath(points, false, 1);
      expect(result?.x).toBeCloseTo(100);
      expect(result?.y).toBeCloseTo(100);
    });

    it('should return midpoint at t=0.5 for straight line', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const result = getPointOnPath(points, false, 0.5);
      expect(result?.x).toBeCloseTo(50);
      expect(result?.y).toBeCloseTo(0);
    });
  });

  describe('getTangentOnPath', () => {
    it('should return null for short path', () => {
      expect(getTangentOnPath([], false, 0.5)).toBeNull();
      expect(getTangentOnPath([createCornerPoint({ x: 0, y: 0 })], false, 0.5)).toBeNull();
    });

    it('should return normalized tangent', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const tangent = getTangentOnPath(points, false, 0.5);
      expect(tangent).not.toBeNull();
      const length = Math.sqrt(tangent!.x ** 2 + tangent!.y ** 2);
      expect(length).toBeCloseTo(1);
    });

    it('should point in direction of path', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const tangent = getTangentOnPath(points, false, 0.5);
      expect(tangent?.x).toBeGreaterThan(0);
      expect(tangent?.y).toBeCloseTo(0);
    });
  });

  describe('getNearestPointOnPath', () => {
    it('should return null for empty path', () => {
      expect(getNearestPointOnPath([], false, { x: 50, y: 50 })).toBeNull();
    });

    it('should return single point for single-point path', () => {
      const points = [createCornerPoint({ x: 50, y: 100 })];
      const result = getNearestPointOnPath(points, false, { x: 0, y: 0 });
      expect(result?.point).toEqual({ x: 50, y: 100 });
    });

    it('should find nearest point on line', () => {
      const points = [createCornerPoint({ x: 0, y: 0 }), createCornerPoint({ x: 100, y: 0 })];
      const result = getNearestPointOnPath(points, false, { x: 50, y: 10 });
      expect(result?.point.x).toBeCloseTo(50);
      expect(result?.point.y).toBeCloseTo(0);
    });

    it('should return correct segment index', () => {
      const points = [
        createCornerPoint({ x: 0, y: 0 }),
        createCornerPoint({ x: 100, y: 0 }),
        createCornerPoint({ x: 100, y: 100 }),
      ];
      const result = getNearestPointOnPath(points, false, { x: 110, y: 50 });
      expect(result?.segmentIndex).toBe(1);
    });
  });
});

describe('Shape Generators', () => {
  describe('createRectanglePath', () => {
    it('should create 4-point rectangle without rounded corners', () => {
      const points = createRectanglePath(0, 0, 100, 50);
      expect(points.length).toBe(4);
      expect(points[0].position).toEqual({ x: 0, y: 0 });
      expect(points[1].position).toEqual({ x: 100, y: 0 });
      expect(points[2].position).toEqual({ x: 100, y: 50 });
      expect(points[3].position).toEqual({ x: 0, y: 50 });
    });

    it('should create corner points for non-rounded rectangle', () => {
      const points = createRectanglePath(0, 0, 100, 50);
      points.forEach((p) => {
        expect(p.type).toBe('corner');
        expect(p.handleIn).toBeNull();
        expect(p.handleOut).toBeNull();
      });
    });

    it('should create more points for rounded corners', () => {
      const sharp = createRectanglePath(0, 0, 100, 100);
      const rounded = createRectanglePath(0, 0, 100, 100, [10, 10, 10, 10]);
      expect(rounded.length).toBeGreaterThan(sharp.length);
    });

    it('should handle asymmetric corner radii', () => {
      const points = createRectanglePath(0, 0, 100, 100, [10, 0, 20, 0]);
      expect(points.length).toBeGreaterThan(4);
    });
  });

  describe('createEllipsePath', () => {
    it('should create 4-point ellipse', () => {
      const points = createEllipsePath(50, 50, 40, 30);
      expect(points.length).toBe(4);
    });

    it('should create symmetric points', () => {
      const points = createEllipsePath(50, 50, 40, 30);
      points.forEach((p) => {
        expect(p.type).toBe('symmetric');
      });
    });

    it('should position points correctly', () => {
      const points = createEllipsePath(100, 100, 50, 25);
      // Top point
      expect(points[0].position.x).toBe(100);
      expect(points[0].position.y).toBe(75);
      // Right point
      expect(points[1].position.x).toBe(150);
      expect(points[1].position.y).toBe(100);
    });

    it('should create circular path when rx=ry', () => {
      const points = createEllipsePath(0, 0, 50, 50);
      // All points should be equidistant from center
      points.forEach((p) => {
        const dist = Math.sqrt(p.position.x ** 2 + p.position.y ** 2);
        expect(dist).toBeCloseTo(50);
      });
    });
  });

  describe('createPolygonPath', () => {
    it('should create triangle with 3 sides', () => {
      const points = createPolygonPath(0, 0, 50, 3);
      expect(points.length).toBe(3);
    });

    it('should create square with 4 sides', () => {
      const points = createPolygonPath(0, 0, 50, 4);
      expect(points.length).toBe(4);
    });

    it('should default to triangle for sides < 3', () => {
      const points = createPolygonPath(0, 0, 50, 2);
      expect(points.length).toBe(3);
    });

    it('should create corner points', () => {
      const points = createPolygonPath(0, 0, 50, 6);
      points.forEach((p) => {
        expect(p.type).toBe('corner');
      });
    });

    it('should place points at correct radius', () => {
      const points = createPolygonPath(0, 0, 50, 6);
      points.forEach((p) => {
        const dist = Math.sqrt(p.position.x ** 2 + p.position.y ** 2);
        expect(dist).toBeCloseTo(50);
      });
    });
  });

  describe('createStarPath', () => {
    it('should create 10-point star (5 outer, 5 inner)', () => {
      const points = createStarPath(0, 0, 50, 25, 5);
      expect(points.length).toBe(10);
    });

    it('should alternate between outer and inner radius', () => {
      const points = createStarPath(0, 0, 100, 50, 4);
      for (let i = 0; i < points.length; i++) {
        const dist = Math.sqrt(points[i].position.x ** 2 + points[i].position.y ** 2);
        const expectedRadius = i % 2 === 0 ? 100 : 50;
        expect(dist).toBeCloseTo(expectedRadius);
      }
    });

    it('should default to 3 points for points < 3', () => {
      const points = createStarPath(0, 0, 50, 25, 2);
      expect(points.length).toBe(6); // 3 outer + 3 inner
    });
  });
});

// ============================================================================
// X2-1: Stroke Outline Generation
// ============================================================================

describe('generateStrokeOutlineVertices', () => {
  it('returns empty array for fewer than 2 vertices', () => {
    const vertices = new Float32Array([10, 20]);
    const result = generateStrokeOutlineVertices(vertices, 1, 4, false);
    expect(result.length).toBe(0);
  });

  it('generates outline for a horizontal 2-point segment', () => {
    // Horizontal line from (0,0) to (100,0), stroke width 10
    const vertices = new Float32Array([0, 0, 100, 0]);
    const result = generateStrokeOutlineVertices(vertices, 2, 10, false);

    // Should have 4 points (2 left + 2 right) = 8 coordinates
    expect(result.length).toBe(8);

    // Left side should be offset Y+5, right side Y-5
    // Point 0 (left of start): (0, 5)
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(5);
    // Point 1 (left of end): (100, 5)
    expect(result[2]).toBeCloseTo(100);
    expect(result[3]).toBeCloseTo(5);
    // Point 2 (right of end, reversed): (100, -5)
    expect(result[4]).toBeCloseTo(100);
    expect(result[5]).toBeCloseTo(-5);
    // Point 3 (right of start, reversed): (0, -5)
    expect(result[6]).toBeCloseTo(0);
    expect(result[7]).toBeCloseTo(-5);
  });

  it('generates outline for a vertical segment', () => {
    // Vertical line from (0,0) to (0,100), stroke width 6
    const vertices = new Float32Array([0, 0, 0, 100]);
    const result = generateStrokeOutlineVertices(vertices, 2, 6, false);

    expect(result.length).toBe(8);

    // For vertical line going down (+Y), perpendicular is (-1, 0)
    // Left side offset X-3, right side offset X+3
    expect(result[0]).toBeCloseTo(-3); // left start X
    expect(result[2]).toBeCloseTo(-3); // left end X
    expect(result[4]).toBeCloseTo(3); // right end X (reversed)
    expect(result[6]).toBeCloseTo(3); // right start X (reversed)
  });

  it('generates outline for multiple points', () => {
    // L-shaped path: (0,0) -> (100,0) -> (100,100)
    const vertices = new Float32Array([0, 0, 100, 0, 100, 100]);
    const result = generateStrokeOutlineVertices(vertices, 3, 4, false);

    // 3 points * 2 sides = 6 points = 12 coordinates
    expect(result.length).toBe(12);

    // All coordinates should be finite
    for (let i = 0; i < result.length; i++) {
      expect(isFinite(result[i])).toBe(true);
    }
  });

  it('handles closed paths', () => {
    // Triangle: (0,0) -> (100,0) -> (50,100)
    const vertices = new Float32Array([0, 0, 100, 0, 50, 100]);
    const result = generateStrokeOutlineVertices(vertices, 3, 2, true);

    // 3 points * 2 sides = 6 points = 12 coordinates
    expect(result.length).toBe(12);

    // All coordinates should be finite
    for (let i = 0; i < result.length; i++) {
      expect(isFinite(result[i])).toBe(true);
    }
  });

  it('handles degenerate (duplicate) points gracefully', () => {
    // Path with a duplicate point: (0,0) -> (50,0) -> (50,0) -> (100,0)
    const vertices = new Float32Array([0, 0, 50, 0, 50, 0, 100, 0]);
    const result = generateStrokeOutlineVertices(vertices, 4, 4, false);

    // Should still generate valid outline (8 points = 16 coords)
    expect(result.length).toBe(16);

    // All coordinates should be finite (no NaN from degenerate direction)
    for (let i = 0; i < result.length; i++) {
      expect(isFinite(result[i])).toBe(true);
    }
  });

  it('enforces minimum half-width of 0.5', () => {
    const vertices = new Float32Array([0, 0, 100, 0]);
    const result = generateStrokeOutlineVertices(vertices, 2, 0.1, false);

    // With minimum half-width of 0.5, left side Y should be 0.5
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[7]).toBeCloseTo(-0.5);
  });
});

// ============================================================================
// Shared Helpers
// ============================================================================

describe('forEachSegment', () => {
  it('iterates over open path segments', () => {
    const points = [
      createCornerPoint({ x: 0, y: 0 }),
      createCornerPoint({ x: 10, y: 0 }),
      createCornerPoint({ x: 20, y: 0 }),
    ];
    const indices: number[] = [];
    forEachSegment(points, false, (_p0, _p1, i) => indices.push(i));
    expect(indices).toEqual([0, 1]);
  });

  it('iterates over closed path segments including closing segment', () => {
    const points = [
      createCornerPoint({ x: 0, y: 0 }),
      createCornerPoint({ x: 10, y: 0 }),
      createCornerPoint({ x: 10, y: 10 }),
    ];
    const indices: number[] = [];
    forEachSegment(points, true, (_p0, _p1, i) => indices.push(i));
    expect(indices).toEqual([0, 1, 2]);
  });

  it('provides correct p0 and p1 for each segment', () => {
    const points = [
      createCornerPoint({ x: 0, y: 0 }),
      createCornerPoint({ x: 10, y: 0 }),
      createCornerPoint({ x: 20, y: 0 }),
    ];
    const starts: number[] = [];
    forEachSegment(points, false, (p0, _p1) => starts.push(p0.position.x));
    expect(starts).toEqual([0, 10]);
  });
});

describe('getAbsoluteControlPoints', () => {
  it('returns anchor positions when handles are null', () => {
    const p0 = createCornerPoint({ x: 0, y: 0 });
    const p1 = createCornerPoint({ x: 100, y: 0 });
    const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
    expect(cp1).toEqual({ x: 0, y: 0 });
    expect(cp2).toEqual({ x: 100, y: 0 });
  });

  it('returns absolute positions from handle offsets', () => {
    const p0 = createSmoothPoint({ x: 0, y: 0 }, { x: 30, y: 0 });
    const p1 = createSmoothPoint({ x: 100, y: 0 }, { x: 30, y: 0 }, { x: -30, y: 0 });
    const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
    expect(cp1).toEqual({ x: 30, y: 0 });
    expect(cp2).toEqual({ x: 70, y: 0 });
  });
});
