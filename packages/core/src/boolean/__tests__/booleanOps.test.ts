import { describe, it, expect } from 'vitest';
import {
  nodeToPolygon,
  performBoolean,
  polygonToContours,
  createBooleanResultNode,
  booleanOperation,
} from '../booleanOps';
import type { RectangleNode, EllipseNode, PolygonNode, PathNode, Matrix3, Fill, Stroke } from '@quar/types';
import { mat3 } from '../../math';

// ============================================================================
// Helpers
// ============================================================================

function makeRect(x: number, y: number, w: number, h: number, id = 'rect1'): RectangleNode {
  return {
    id,
    name: 'Rect',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: x + w / 2, y: y + h / 2 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: w,
    height: h,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function makeEllipse(cx: number, cy: number, rx: number, ry: number, id = 'ell1'): EllipseNode {
  return {
    id,
    name: 'Ellipse',
    type: 'ellipse',
    parent: null,
    children: [],
    transform: {
      position: { x: cx, y: cy },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: rx,
    radiusY: ry,
    fills: [{ type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function makePolygon(cx: number, cy: number, r: number, sides: number, id = 'poly1'): PolygonNode {
  return {
    id,
    name: 'Polygon',
    type: 'polygon',
    parent: null,
    children: [],
    transform: {
      position: { x: cx, y: cy },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides,
    radius: r,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 255, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function makePath(points: Array<{ x: number; y: number }>, id = 'path1'): PathNode {
  return {
    id,
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: points.map(p => ({
      position: p,
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    })),
    closed: true,
    fills: [{ type: 'solid', color: { r: 128, g: 128, b: 128, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function worldTransform(node: { transform: { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number }; anchor: { x: number; y: number } } }): Matrix3 {
  return mat3.compose(
    node.transform.position,
    node.transform.rotation,
    node.transform.scale,
    node.transform.anchor
  );
}

let idCounter = 0;
function generateId(): string {
  return `bool_${++idCounter}`;
}

// ============================================================================
// nodeToPolygon
// ============================================================================

describe('nodeToPolygon', () => {
  it('converts a rectangle to a polygon', () => {
    const rect = makeRect(0, 0, 100, 100);
    const poly = nodeToPolygon(rect, worldTransform(rect));
    expect(poly).not.toBeNull();
    expect(poly!.length).toBe(1); // One polygon
    expect(poly![0].length).toBeGreaterThanOrEqual(1); // At least one ring
    expect(poly![0][0].length).toBeGreaterThanOrEqual(3); // At least 3 points
  });

  it('converts an ellipse to a polygon', () => {
    const ell = makeEllipse(50, 50, 30, 30);
    const poly = nodeToPolygon(ell, worldTransform(ell));
    expect(poly).not.toBeNull();
    expect(poly![0][0].length).toBeGreaterThan(8); // Ellipse tessellates to many points
  });

  it('converts a polygon node to a polygon', () => {
    const pg = makePolygon(50, 50, 40, 6);
    const poly = nodeToPolygon(pg, worldTransform(pg));
    expect(poly).not.toBeNull();
    expect(poly![0][0].length).toBeGreaterThanOrEqual(6);
  });

  it('converts a path node to a polygon', () => {
    const path = makePath([
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ]);
    const poly = nodeToPolygon(path, worldTransform(path));
    expect(poly).not.toBeNull();
  });

  it('applies world transform to polygon points', () => {
    const rect = makeRect(0, 0, 100, 100);
    // Translate by (200, 300) via world transform
    const translated = mat3.compose(
      { x: 200, y: 300 },
      0,
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5 }
    );
    const poly = nodeToPolygon(rect, translated);
    expect(poly).not.toBeNull();
    // All points should be near (200, 300) center
    for (const pt of poly![0][0]) {
      expect(pt[0]).toBeGreaterThan(100); // Shifted right
      expect(pt[1]).toBeGreaterThan(200); // Shifted up
    }
  });

  it('returns null for unsupported node types', () => {
    const group = { id: 'g', name: 'G', type: 'group' as const, parent: null, children: [], transform: { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, anchor: { x: 0.5, y: 0.5 }, skew: { x: 0, y: 0 } }, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const };
    const poly = nodeToPolygon(group, mat3.identity());
    expect(poly).toBeNull();
  });

  it('returns null for open paths', () => {
    const path = makePath([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    path.closed = false;
    const poly = nodeToPolygon(path, worldTransform(path));
    expect(poly).toBeNull();
  });
});

// ============================================================================
// performBoolean
// ============================================================================

describe('performBoolean', () => {
  // Two overlapping unit squares
  const squareA: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const squareB: [number, number][] = [[5, 0], [15, 0], [15, 10], [5, 10], [5, 0]];
  const polyA = [[squareA]] as import('polygon-clipping').MultiPolygon;
  const polyB = [[squareB]] as import('polygon-clipping').MultiPolygon;

  it('union combines overlapping polygons', () => {
    const result = performBoolean(polyA, polyB, 'union');
    expect(result.length).toBeGreaterThan(0);
    // Union of two overlapping 10x10 squares → 15x10 area
    const ring = result[0][0];
    const xs = ring.map(p => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(15);
  });

  it('subtract removes overlap area', () => {
    const result = performBoolean(polyA, polyB, 'subtract');
    expect(result.length).toBeGreaterThan(0);
    // A minus B: left portion of A (x: 0..5)
    const ring = result[0][0];
    const xs = ring.map(p => p[0]);
    expect(Math.max(...xs)).toBeCloseTo(5);
    expect(Math.min(...xs)).toBeCloseTo(0);
  });

  it('intersect returns only overlap area', () => {
    const result = performBoolean(polyA, polyB, 'intersect');
    expect(result.length).toBeGreaterThan(0);
    // Intersection: x 5..10
    const ring = result[0][0];
    const xs = ring.map(p => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(5);
    expect(Math.max(...xs)).toBeCloseTo(10);
  });

  it('exclude returns XOR (non-overlapping areas)', () => {
    const result = performBoolean(polyA, polyB, 'exclude');
    expect(result.length).toBeGreaterThan(0);
    // XOR: two separate regions (x: 0..5 and x: 10..15)
    const allXs: number[] = [];
    for (const polygon of result) {
      for (const ring of polygon) {
        for (const pt of ring) allXs.push(pt[0]);
      }
    }
    expect(Math.min(...allXs)).toBeCloseTo(0);
    expect(Math.max(...allXs)).toBeCloseTo(15);
  });

  it('handles disjoint polygons for union', () => {
    const farSquare: [number, number][] = [[100, 100], [110, 100], [110, 110], [100, 110], [100, 100]];
    const polyFar = [[farSquare]] as import('polygon-clipping').MultiPolygon;
    const result = performBoolean(polyA, polyFar, 'union');
    // Two disjoint polygons
    expect(result.length).toBe(2);
  });

  it('handles disjoint polygons for intersect (empty result)', () => {
    const farSquare: [number, number][] = [[100, 100], [110, 100], [110, 110], [100, 110], [100, 100]];
    const polyFar = [[farSquare]] as import('polygon-clipping').MultiPolygon;
    const result = performBoolean(polyA, polyFar, 'intersect');
    expect(result.length).toBe(0);
  });

  it('handles contained polygon for subtract', () => {
    // B completely inside A
    const bigSquare: [number, number][] = [[-10, -10], [20, -10], [20, 20], [-10, 20], [-10, -10]];
    const polyBig = [[bigSquare]] as import('polygon-clipping').MultiPolygon;
    const result = performBoolean(polyBig, polyA, 'subtract');
    // Result should be donut shape (big minus small)
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// polygonToContours
// ============================================================================

describe('polygonToContours', () => {
  it('converts a simple polygon result to PathPoint contours', () => {
    const result: import('polygon-clipping').MultiPolygon = [
      [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
    ];
    const contours = polygonToContours(result);
    expect(contours.length).toBe(1);
    expect(contours[0].length).toBe(4); // Closing point removed
    expect(contours[0][0].position).toEqual({ x: 0, y: 0 });
    expect(contours[0][0].type).toBe('corner');
    expect(contours[0][0].handleIn).toBeNull();
  });

  it('converts multi-polygon result to multiple contours', () => {
    const result: import('polygon-clipping').MultiPolygon = [
      [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
      [[[10, 10], [15, 10], [15, 15], [10, 15], [10, 10]]],
    ];
    const contours = polygonToContours(result);
    expect(contours.length).toBe(2);
  });

  it('handles polygon with holes', () => {
    const result: import('polygon-clipping').MultiPolygon = [
      [
        [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],    // outer
        [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]],      // hole
      ]
    ];
    const contours = polygonToContours(result);
    expect(contours.length).toBe(2); // outer + hole
  });

  it('filters out degenerate rings', () => {
    const result: import('polygon-clipping').MultiPolygon = [
      [[[0, 0], [10, 0]]] // Only 2 points — degenerate
    ];
    const contours = polygonToContours(result);
    expect(contours.length).toBe(0);
  });

  it('handles empty result', () => {
    const contours = polygonToContours([]);
    expect(contours.length).toBe(0);
  });
});

// ============================================================================
// createBooleanResultNode
// ============================================================================

describe('createBooleanResultNode', () => {
  const fills: Fill[] = [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }];
  const strokes: Stroke[] = [];

  it('creates a centered PathNode from single contour', () => {
    const contours = [
      [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 100, y: 100 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 0, y: 100 }, handleIn: null, handleOut: null, type: 'corner' as const },
      ],
    ];
    const node = createBooleanResultNode(contours, fills, strokes, 'Union', generateId);
    expect(node).not.toBeNull();
    expect(node!.type).toBe('path');
    expect(node!.closed).toBe(true);
    expect(node!.transform.position).toEqual({ x: 50, y: 50 }); // Centered
    expect(node!.points.length).toBe(4);
    expect(node!.subpaths).toBeUndefined();
    expect(node!.fillRule).toBeUndefined();
  });

  it('creates a PathNode with subpaths from multiple contours', () => {
    const contours = [
      [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 100, y: 100 }, handleIn: null, handleOut: null, type: 'corner' as const },
      ],
      [
        { position: { x: 20, y: 20 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 80, y: 20 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 80, y: 80 }, handleIn: null, handleOut: null, type: 'corner' as const },
      ],
    ];
    const node = createBooleanResultNode(contours, fills, strokes, 'Subtract', generateId);
    expect(node).not.toBeNull();
    expect(node!.subpaths).toBeDefined();
    expect(node!.subpaths!.length).toBe(1);
    expect(node!.fillRule).toBe('evenodd');
  });

  it('returns null for empty contours', () => {
    const node = createBooleanResultNode([], fills, strokes, 'Test', generateId);
    expect(node).toBeNull();
  });

  it('preserves fills and strokes', () => {
    const testStrokes: Stroke[] = [{ color: { r: 0, g: 0, b: 0, a: 1 }, width: 2, opacity: 1, cap: 'round', join: 'round', visible: true }];
    const contours = [
      [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 10, y: 0 }, handleIn: null, handleOut: null, type: 'corner' as const },
        { position: { x: 10, y: 10 }, handleIn: null, handleOut: null, type: 'corner' as const },
      ],
    ];
    const node = createBooleanResultNode(contours, fills, testStrokes, 'Test', generateId);
    expect(node!.fills).toEqual(fills);
    expect(node!.strokes).toEqual(testStrokes);
  });
});

// ============================================================================
// booleanOperation (high-level)
// ============================================================================

describe('booleanOperation', () => {
  it('performs union on two overlapping rectangles', () => {
    const rectA = makeRect(0, 0, 100, 100, 'a');
    const rectB = makeRect(50, 0, 100, 100, 'b');
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'union',
      generateId
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
    expect(result!.closed).toBe(true);
  });

  it('performs subtract on two overlapping rectangles', () => {
    const rectA = makeRect(0, 0, 100, 100, 'a');
    const rectB = makeRect(50, 0, 100, 100, 'b');
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'subtract',
      generateId
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
  });

  it('performs intersect on two overlapping rectangles', () => {
    const rectA = makeRect(0, 0, 100, 100, 'a');
    const rectB = makeRect(50, 0, 100, 100, 'b');
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'intersect',
      generateId
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
  });

  it('performs exclude on two overlapping rectangles', () => {
    const rectA = makeRect(0, 0, 100, 100, 'a');
    const rectB = makeRect(50, 0, 100, 100, 'b');
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'exclude',
      generateId
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
  });

  it('returns null for disjoint intersect', () => {
    const rectA = makeRect(0, 0, 10, 10, 'a');
    const rectB = makeRect(1000, 1000, 10, 10, 'b');
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'intersect',
      generateId
    );
    expect(result).toBeNull();
  });

  it('returns null with fewer than 2 nodes', () => {
    const rectA = makeRect(0, 0, 100, 100, 'a');
    const result = booleanOperation([rectA], [worldTransform(rectA)], 'union', generateId);
    expect(result).toBeNull();
  });

  it('handles 3+ nodes iteratively', () => {
    const rects = [
      makeRect(0, 0, 100, 100, 'a'),
      makeRect(50, 0, 100, 100, 'b'),
      makeRect(100, 0, 100, 100, 'c'),
    ];
    const transforms = rects.map(r => worldTransform(r));
    const result = booleanOperation(rects, transforms, 'union', generateId);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
  });

  it('preserves fills from the first node', () => {
    const rectA = makeRect(0, 0, 100, 100, 'a');
    const rectB = makeRect(50, 0, 100, 100, 'b');
    rectB.fills = [{ type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 }, opacity: 1, visible: true }];
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'union',
      generateId
    );
    expect(result).not.toBeNull();
    expect(result!.fills).toEqual(rectA.fills);
  });

  it('handles mixed shape types (rect + ellipse)', () => {
    const rect = makeRect(0, 0, 100, 100, 'r');
    const ell = makeEllipse(80, 50, 40, 40, 'e');
    const result = booleanOperation(
      [rect, ell],
      [worldTransform(rect), worldTransform(ell)],
      'union',
      generateId
    );
    expect(result).not.toBeNull();
  });

  it('handles rect + polygon', () => {
    const rect = makeRect(0, 0, 100, 100, 'r');
    const poly = makePolygon(50, 50, 60, 6, 'p');
    const result = booleanOperation(
      [rect, poly],
      [worldTransform(rect), worldTransform(poly)],
      'union',
      generateId
    );
    expect(result).not.toBeNull();
  });

  it('handles path + rect', () => {
    const path = makePath([
      { x: -50, y: -50 }, { x: 50, y: -50 },
      { x: 50, y: 50 }, { x: -50, y: 50 },
    ], 'p');
    const rect = makeRect(0, 0, 60, 60, 'r');
    const result = booleanOperation(
      [path, rect],
      [worldTransform(path), worldTransform(rect)],
      'subtract',
      generateId
    );
    expect(result).not.toBeNull();
  });

  it('subtract creates subpaths (holes) when B is inside A', () => {
    // Big rect with small rect inside
    const big = makeRect(0, 0, 200, 200, 'big');
    const small = makeRect(50, 50, 50, 50, 'small');
    const result = booleanOperation(
      [big, small],
      [worldTransform(big), worldTransform(small)],
      'subtract',
      generateId
    );
    expect(result).not.toBeNull();
    // Should have outer contour + hole
    expect(result!.subpaths).toBeDefined();
    expect(result!.subpaths!.length).toBeGreaterThanOrEqual(1);
  });

  it('result node is centered', () => {
    const rectA = makeRect(100, 100, 50, 50, 'a');
    const rectB = makeRect(120, 100, 50, 50, 'b');
    const result = booleanOperation(
      [rectA, rectB],
      [worldTransform(rectA), worldTransform(rectB)],
      'union',
      generateId
    );
    expect(result).not.toBeNull();
    // Position should be approximately at the center of the union
    expect(result!.transform.position.x).toBeGreaterThan(100);
    expect(result!.transform.position.y).toBeGreaterThan(100);
  });

  it('handles scaled transform', () => {
    const rect = makeRect(0, 0, 50, 50, 'a');
    rect.transform.scale = { x: 2, y: 2 };
    const rect2 = makeRect(40, 0, 50, 50, 'b');
    const result = booleanOperation(
      [rect, rect2],
      [worldTransform(rect), worldTransform(rect2)],
      'union',
      generateId
    );
    expect(result).not.toBeNull();
  });

  it('handles rotated transform', () => {
    const rect = makeRect(0, 0, 100, 100, 'a');
    rect.transform.rotation = 45;
    const rect2 = makeRect(50, 50, 100, 100, 'b');
    const result = booleanOperation(
      [rect, rect2],
      [worldTransform(rect), worldTransform(rect2)],
      'intersect',
      generateId
    );
    expect(result).not.toBeNull();
  });
});
