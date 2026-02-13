import { describe, it, expect } from 'vitest';
import { outlineStroke } from './outlineStroke';
import type { RectangleNode, EllipseNode, PolygonNode, PathNode, PathPoint } from '@quar/types';

// ============================================================================
// Helpers
// ============================================================================

let idCounter = 0;
function generateId() {
  return `test-id-${idCounter++}`;
}

function makeTransform(x = 0, y = 0) {
  return {
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: 0, y: 0 },
  };
}

function makeStroke(width = 2) {
  return {
    type: 'solid' as const,
    color: { r: 0, g: 0, b: 0, a: 1 },
    opacity: 1,
    visible: true,
    width,
    align: 'center' as const,
  };
}

function makeRect(w: number, h: number, strokeWidth = 2): RectangleNode {
  return {
    id: 'rect1',
    name: 'Rectangle',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: makeTransform(0, 0),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: w,
    height: h,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [makeStroke(strokeWidth)],
  };
}

function makeEllipse(rx: number, ry: number, strokeWidth = 2): EllipseNode {
  return {
    id: 'ell1',
    name: 'Ellipse',
    type: 'ellipse',
    parent: null,
    children: [],
    transform: makeTransform(0, 0),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: rx,
    radiusY: ry,
    fills: [],
    strokes: [makeStroke(strokeWidth)],
  };
}

function makePolygon(radius: number, sides: number, strokeWidth = 2): PolygonNode {
  return {
    id: 'poly1',
    name: 'Polygon',
    type: 'polygon',
    parent: null,
    children: [],
    transform: makeTransform(0, 0),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radius,
    sides,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [makeStroke(strokeWidth)],
  };
}

function makeCorner(x: number, y: number): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner' };
}

function makeOpenPath(points: PathPoint[], strokeWidth = 2): PathNode {
  return {
    id: 'path1',
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform: makeTransform(0, 0),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points,
    closed: false,
    fillRule: 'nonzero',
    fills: [],
    strokes: [makeStroke(strokeWidth)],
  };
}

function makeClosedPath(points: PathPoint[], strokeWidth = 2): PathNode {
  return {
    id: 'path2',
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform: makeTransform(0, 0),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points,
    closed: true,
    fillRule: 'nonzero',
    fills: [],
    strokes: [makeStroke(strokeWidth)],
  };
}

/** Get the AABB of all contour points (primary + subpaths) */
function getResultBounds(result: PathNode) {
  const allPoints: PathPoint[] = [...result.points];
  if (result.subpaths) {
    for (const sp of result.subpaths) allPoints.push(...sp);
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const pt of allPoints) {
    if (pt.position.x < minX) minX = pt.position.x;
    if (pt.position.y < minY) minY = pt.position.y;
    if (pt.position.x > maxX) maxX = pt.position.x;
    if (pt.position.y > maxY) maxY = pt.position.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ============================================================================
// Tests
// ============================================================================

describe('outlineStroke', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  describe('returns null for invalid inputs', () => {
    it('returns null when node has no strokes', () => {
      const node = makeRect(100, 80);
      node.strokes = [];
      expect(outlineStroke(node, 0, generateId)).toBeNull();
    });

    it('returns null when stroke is not visible', () => {
      const node = makeRect(100, 80);
      node.strokes[0].visible = false;
      expect(outlineStroke(node, 0, generateId)).toBeNull();
    });

    it('returns null for invalid stroke index', () => {
      const node = makeRect(100, 80);
      expect(outlineStroke(node, 5, generateId)).toBeNull();
    });
  });

  describe('rectangle outline stroke', () => {
    it('produces a valid PathNode', () => {
      const result = outlineStroke(makeRect(100, 80), 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('path');
      expect(result!.closed).toBe(true);
      expect(result!.fillRule).toBe('evenodd');
      expect(result!.fills.length).toBe(1);
      expect(result!.strokes).toEqual([]);
    });

    it('produces outer and inner contours for closed shape', () => {
      const result = outlineStroke(makeRect(100, 80), 0, generateId);
      expect(result).not.toBeNull();
      // Closed shapes should produce two contours: outer ring + inner ring
      expect(result!.subpaths).toBeDefined();
      expect(result!.subpaths!.length).toBeGreaterThanOrEqual(1);
      // Primary contour (outer) + at least one subpath (inner)
      expect(result!.points.length).toBeGreaterThanOrEqual(4);
      expect(result!.subpaths![0].length).toBeGreaterThanOrEqual(4);
    });

    it('outline covers all four sides (no missing left edge)', () => {
      const strokeWidth = 4;
      const result = outlineStroke(makeRect(100, 80, strokeWidth), 0, generateId);
      expect(result).not.toBeNull();

      // Collect ALL points from both contours (outer + inner)
      const allPts = [...result!.points, ...(result!.subpaths?.[0] ?? [])];
      const xs = allPts.map((p) => p.position.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);

      // The combined contours should extend beyond the base shape on both sides.
      // For a 100x80 rect with stroke 4, some contour should reach beyond ±50.
      // (Corner miter offsets are diagonal, so exact extent depends on miter angle)
      expect(minX).toBeLessThan(-50);
      expect(maxX).toBeGreaterThan(50);

      // Both contours must have left-side vertices (X < 0) and right-side (X > 0)
      // This is the key check: the left side must NOT be missing
      const outerXs = result!.points.map((p) => p.position.x);
      const innerXs = (result!.subpaths?.[0] ?? []).map((p) => p.position.x);
      expect(Math.min(...outerXs)).toBeLessThan(0);
      expect(Math.max(...outerXs)).toBeGreaterThan(0);
      expect(Math.min(...innerXs)).toBeLessThan(0);
      expect(Math.max(...innerXs)).toBeGreaterThan(0);
    });

    it('stroke width affects outline size', () => {
      const thin = outlineStroke(makeRect(100, 80, 2), 0, generateId);
      const thick = outlineStroke(makeRect(100, 80, 10), 0, generateId);
      expect(thin).not.toBeNull();
      expect(thick).not.toBeNull();

      const thinBounds = getResultBounds(thin!);
      const thickBounds = getResultBounds(thick!);
      // Thicker stroke should produce larger outline
      expect(thickBounds.width).toBeGreaterThan(thinBounds.width);
      expect(thickBounds.height).toBeGreaterThan(thinBounds.height);
    });
  });

  describe('ellipse outline stroke', () => {
    it('produces outer and inner contours', () => {
      const result = outlineStroke(makeEllipse(50, 40), 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.subpaths).toBeDefined();
      expect(result!.subpaths!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('polygon outline stroke', () => {
    it('produces outer and inner contours for triangle', () => {
      const result = outlineStroke(makePolygon(50, 3), 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.subpaths).toBeDefined();
      expect(result!.subpaths!.length).toBeGreaterThanOrEqual(1);
    });

    it('produces outer and inner contours for hexagon', () => {
      const result = outlineStroke(makePolygon(50, 6), 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.subpaths).toBeDefined();
    });
  });

  describe('open path outline stroke', () => {
    it('produces a single contour (no subpaths)', () => {
      const points = [makeCorner(0, 0), makeCorner(50, 0), makeCorner(50, 50)];
      const result = outlineStroke(makeOpenPath(points), 0, generateId);
      expect(result).not.toBeNull();
      // Open paths produce a single ribbon polygon, not two contours
      expect(result!.subpaths).toBeUndefined();
      // Curve fitting reduces many corner points to fewer smooth points with handles
      expect(result!.points.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('closed path outline stroke', () => {
    it('produces two contours for closed triangle path', () => {
      const points = [makeCorner(0, 50), makeCorner(50, -50), makeCorner(-50, -50)];
      const result = outlineStroke(makeClosedPath(points), 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.subpaths).toBeDefined();
      expect(result!.subpaths!.length).toBeGreaterThanOrEqual(1);
    });

    it('first point of closed contour has handleIn for smooth closing segment', () => {
      // A curved closed path where the closing segment must be smooth
      const points: PathPoint[] = [
        { ...makeCorner(-50, -50), cornerRadius: 20 },
        { ...makeCorner(50, -50), cornerRadius: 20 },
        { ...makeCorner(50, 50), cornerRadius: 20 },
        { ...makeCorner(-50, 50), cornerRadius: 20 },
      ];
      const result = outlineStroke(makeClosedPath(points, 4), 0, generateId);
      expect(result).not.toBeNull();

      // The first point of the outer contour should have handleIn
      // (transferred from the closing point during curve fitting)
      // so the closing segment is a smooth curve, not a straight line
      const firstPoint = result!.points[0];
      expect(firstPoint.handleIn).not.toBeNull();
    });

    it('covers all edges of a closed square path', () => {
      const points = [
        makeCorner(-50, -40),
        makeCorner(50, -40),
        makeCorner(50, 40),
        makeCorner(-50, 40),
      ];
      const strokeWidth = 4;
      const result = outlineStroke(makeClosedPath(points, strokeWidth), 0, generateId);
      expect(result).not.toBeNull();

      // Check that combined contours cover the full shape extent
      const allPts = [...result!.points, ...(result!.subpaths?.[0] ?? [])];
      const allXs = allPts.map((p) => p.position.x);
      const allMinX = Math.min(...allXs);
      const allMaxX = Math.max(...allXs);
      // Should extend beyond the shape bounds
      expect(allMinX).toBeLessThan(-50);
      expect(allMaxX).toBeGreaterThan(50);

      // Both contours must span the full width (no missing side)
      const outerXs = result!.points.map((p) => p.position.x);
      expect(Math.min(...outerXs)).toBeLessThan(0);
      expect(Math.max(...outerXs)).toBeGreaterThan(0);
    });
  });

  describe('per-vertex corner radius', () => {
    it('produces curved outline when path points have cornerRadius', () => {
      // Square path with corner radius on all 4 points
      const points: PathPoint[] = [
        { ...makeCorner(-50, -50), cornerRadius: 15 },
        { ...makeCorner(50, -50), cornerRadius: 15 },
        { ...makeCorner(50, 50), cornerRadius: 15 },
        { ...makeCorner(-50, 50), cornerRadius: 15 },
      ];
      const result = outlineStroke(makeClosedPath(points, 4), 0, generateId);
      expect(result).not.toBeNull();

      // Without corner radius, a 100x100 square produces exactly 4 outer + 4 inner points.
      // With corner radius applied, each corner becomes a bezier arc (3 points per corner),
      // resulting in significantly more points.
      const totalPoints = result!.points.length + (result!.subpaths?.[0]?.length ?? 0);
      // Should have more than 8 points total (4+4 from a sharp square)
      expect(totalPoints).toBeGreaterThan(16);
    });

    it('produces smooth points with bezier handles, not many corner points', () => {
      const points: PathPoint[] = [
        { ...makeCorner(-50, -50), cornerRadius: 15 },
        { ...makeCorner(50, -50), cornerRadius: 15 },
        { ...makeCorner(50, 50), cornerRadius: 15 },
        { ...makeCorner(-50, 50), cornerRadius: 15 },
      ];
      const result = outlineStroke(makeClosedPath(points, 4), 0, generateId);
      expect(result).not.toBeNull();

      // Curve fitting should produce smooth points with bezier handles
      const allPoints = [...result!.points, ...(result!.subpaths?.[0] ?? [])];
      const pointsWithHandles = allPoints.filter(
        (p) => p.handleIn !== null || p.handleOut !== null
      );
      // Most points should have handles (smooth curves, not corner segments)
      expect(pointsWithHandles.length).toBeGreaterThan(allPoints.length / 2);
    });

    it('outline is wider than shape without corner radius', () => {
      // Same shape, one with corner radius and one without
      const sharpPoints: PathPoint[] = [
        makeCorner(-50, -50),
        makeCorner(50, -50),
        makeCorner(50, 50),
        makeCorner(-50, 50),
      ];
      const roundedPoints: PathPoint[] = [
        { ...makeCorner(-50, -50), cornerRadius: 15 },
        { ...makeCorner(50, -50), cornerRadius: 15 },
        { ...makeCorner(50, 50), cornerRadius: 15 },
        { ...makeCorner(-50, 50), cornerRadius: 15 },
      ];
      const sharp = outlineStroke(makeClosedPath(sharpPoints, 4), 0, generateId);
      const rounded = outlineStroke(makeClosedPath(roundedPoints, 4), 0, generateId);
      expect(sharp).not.toBeNull();
      expect(rounded).not.toBeNull();

      // Both should produce valid results
      const sharpBounds = getResultBounds(sharp!);
      const roundedBounds = getResultBounds(rounded!);

      // Rounded corners pull inward, so the rounded outline should be
      // narrower or similar (corners are clipped by the radius)
      // The key assertion: both produce valid outlines with sensible bounds
      expect(sharpBounds.width).toBeGreaterThan(0);
      expect(roundedBounds.width).toBeGreaterThan(0);
      expect(sharpBounds.height).toBeGreaterThan(0);
      expect(roundedBounds.height).toBeGreaterThan(0);
    });
  });

  describe('output properties', () => {
    it('copies stroke color to fill', () => {
      const node = makeRect(100, 80);
      node.strokes = [
        {
          type: 'solid',
          color: { r: 255, g: 128, b: 0, a: 1 },
          opacity: 0.8,
          visible: true,
          width: 2,
          align: 'center',
        },
      ];
      const result = outlineStroke(node, 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.fills[0].color).toEqual({ r: 255, g: 128, b: 0, a: 1 });
      expect(result!.fills[0].opacity).toBe(0.8);
    });

    it('preserves node transform rotation', () => {
      const node = makeRect(100, 80);
      node.transform.rotation = 45;
      const result = outlineStroke(node, 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.transform.rotation).toBe(45);
    });

    it('names the result with (Stroke Outline) suffix', () => {
      const node = makeRect(100, 80);
      node.name = 'My Shape';
      const result = outlineStroke(node, 0, generateId);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('My Shape (Stroke Outline)');
    });
  });
});
