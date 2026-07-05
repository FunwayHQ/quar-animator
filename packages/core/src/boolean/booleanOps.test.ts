/**
 * Tests for booleanOps — nodeToPolygon, performBoolean, polygonToContours,
 * createBooleanResultNode, booleanOperation.
 */

import { describe, it, expect } from 'vitest';
import {
  nodeToPolygon,
  performBoolean,
  polygonToContours,
  createBooleanResultNode,
  booleanOperation,
} from './booleanOps';
import type { BooleanOp } from './booleanOps';
import type { Node, PathNode, PathPoint, Fill, Stroke, Matrix3 } from '@quar/types';
import { mat3 } from '../math';

// ============================================================================
// Helpers
// ============================================================================

function makeRect(id: string, x: number, y: number, w: number, h: number): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x, y },
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
    strokes: [
      {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 1,
        opacity: 1,
        cap: 'round',
        join: 'round',
        visible: true,
        align: 'center',
      },
    ],
  } as unknown as Node;
}

function makeEllipse(id: string, cx: number, cy: number, rx: number, ry: number): Node {
  return {
    id,
    name: id,
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
  } as unknown as Node;
}

function makePolygon(id: string, cx: number, cy: number, radius: number, sides: number): Node {
  return {
    id,
    name: id,
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
    radius,
    fills: [],
    strokes: [],
  } as unknown as Node;
}

function makePath(
  id: string,
  points: PathPoint[],
  closed: boolean,
  subpaths?: PathPoint[][]
): Node {
  return {
    id,
    name: id,
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
    points,
    subpaths,
    closed,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 255, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  } as unknown as Node;
}

function makeCornerPoint(x: number, y: number): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner' };
}

function nodeTransform(node: Node): Matrix3 {
  return mat3.compose(
    node.transform.position,
    node.transform.rotation,
    node.transform.scale,
    node.transform.anchor
  );
}

let idCounter = 0;
function generateId(): string {
  return `test-${++idCounter}`;
}

// ============================================================================
// nodeToPolygon
// ============================================================================

describe('nodeToPolygon', () => {
  it('converts a rectangle node to MultiPolygon', () => {
    const rect = makeRect('r1', 0, 0, 100, 100);
    const result = nodeToPolygon(rect, nodeTransform(rect));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1); // one polygon
    expect(result![0].length).toBeGreaterThanOrEqual(1); // at least one ring
    expect(result![0][0].length).toBeGreaterThanOrEqual(4); // at least 4 points (closed ring)
  });

  it('converts an ellipse node to MultiPolygon', () => {
    const ellipse = makeEllipse('e1', 50, 50, 40, 30);
    const result = nodeToPolygon(ellipse, nodeTransform(ellipse));
    expect(result).not.toBeNull();
    expect(result![0][0].length).toBeGreaterThan(4); // ellipse tessellates to many points
  });

  it('converts a polygon node to MultiPolygon', () => {
    const poly = makePolygon('p1', 50, 50, 60, 6);
    const result = nodeToPolygon(poly, nodeTransform(poly));
    expect(result).not.toBeNull();
    expect(result![0][0].length).toBeGreaterThanOrEqual(6);
  });

  it('converts a closed path node to MultiPolygon', () => {
    const points = [
      makeCornerPoint(0, 0),
      makeCornerPoint(100, 0),
      makeCornerPoint(100, 100),
      makeCornerPoint(0, 100),
    ];
    const path = makePath('path1', points, true);
    const result = nodeToPolygon(path, mat3.identity());
    expect(result).not.toBeNull();
    expect(result![0][0].length).toBeGreaterThanOrEqual(4);
  });

  it('returns null for open path', () => {
    const points = [makeCornerPoint(0, 0), makeCornerPoint(100, 0)];
    const path = makePath('path2', points, false);
    const result = nodeToPolygon(path, mat3.identity());
    expect(result).toBeNull();
  });

  it('returns null for unsupported node types (group)', () => {
    const group = {
      id: 'g1',
      name: 'g1',
      type: 'group',
      parent: null,
      children: [],
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    } as unknown as Node;
    const result = nodeToPolygon(group, mat3.identity());
    expect(result).toBeNull();
  });

  it('applies world transform to polygon vertices', () => {
    const rect = makeRect('r1', 0, 0, 10, 10);
    // Translate by (100, 200)
    const transform = mat3.compose({ x: 100, y: 200 }, 0, { x: 1, y: 1 });
    const result = nodeToPolygon(rect, transform);
    expect(result).not.toBeNull();
    // All points should be near (100, 200) ± 5 (half of 10x10 rect)
    for (const [x, y] of result![0][0]) {
      expect(x).toBeGreaterThanOrEqual(94);
      expect(x).toBeLessThanOrEqual(106);
      expect(y).toBeGreaterThanOrEqual(194);
      expect(y).toBeLessThanOrEqual(206);
    }
  });

  it('handles path with subpaths', () => {
    const outerPoints = [
      makeCornerPoint(0, 0),
      makeCornerPoint(100, 0),
      makeCornerPoint(100, 100),
      makeCornerPoint(0, 100),
    ];
    const innerPoints = [
      makeCornerPoint(20, 20),
      makeCornerPoint(80, 20),
      makeCornerPoint(80, 80),
      makeCornerPoint(20, 80),
    ];
    const path = makePath('path3', outerPoints, true, [innerPoints]);
    const result = nodeToPolygon(path, mat3.identity());
    expect(result).not.toBeNull();
    // Should have 2 rings in the polygon (outer + hole)
    expect(result![0].length).toBe(2);
  });

  it('keeps a disjoint subpath as a separate polygon, not a hole (F003)', () => {
    const primary = [
      makeCornerPoint(0, 0),
      makeCornerPoint(40, 0),
      makeCornerPoint(40, 40),
      makeCornerPoint(0, 40),
    ];
    const disjoint = [
      makeCornerPoint(60, 0),
      makeCornerPoint(100, 0),
      makeCornerPoint(100, 40),
      makeCornerPoint(60, 40),
    ];
    const path = makePath('disjoint', primary, true, [disjoint]);

    const result = nodeToPolygon(path, mat3.identity());
    expect(result).not.toBeNull();
    // Two separate Polygons — the disjoint piece is NOT a hole of the first.
    expect(result!.length).toBe(2);
    expect(result![0].length).toBe(1);
    expect(result![1].length).toBe(1);
  });

  it('does not destroy a disjoint piece on a boolean pass that misses it (F003)', () => {
    const primary = [
      makeCornerPoint(0, 0),
      makeCornerPoint(40, 0),
      makeCornerPoint(40, 40),
      makeCornerPoint(0, 40),
    ];
    const disjoint = [
      makeCornerPoint(60, 0),
      makeCornerPoint(100, 0),
      makeCornerPoint(100, 40),
      makeCornerPoint(60, 40),
    ];
    const poly = nodeToPolygon(makePath('two-piece', primary, true, [disjoint]), mat3.identity())!;

    // Subtract an eraser far from both pieces → both must survive.
    const eraserFar = [
      [
        [
          [500, 500],
          [600, 500],
          [600, 600],
          [500, 600],
          [500, 500],
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;
    const result = performBoolean(poly, eraserFar, 'subtract');
    const contours = polygonToContours(result);

    // Both disjoint pieces remain (the old lumping destroyed the second one).
    expect(contours.length).toBe(2);
  });
});

// ============================================================================
// performBoolean
// ============================================================================

describe('performBoolean', () => {
  // Create two simple overlapping squares as MultiPolygons
  const squareA = [
    [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ],
  ] as import('polygon-clipping').MultiPolygon;

  const squareB = [
    [
      [
        [50, 0],
        [150, 0],
        [150, 100],
        [50, 100],
        [50, 0],
      ],
    ],
  ] as import('polygon-clipping').MultiPolygon;

  it('union produces larger area', () => {
    const result = performBoolean(squareA, squareB, 'union');
    expect(result.length).toBeGreaterThan(0);
    // Union of 100x100 and 100x100 with 50px overlap → 150x100
    const ring = result[0][0];
    const xs = ring.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(0, 0);
    expect(Math.max(...xs)).toBeCloseTo(150, 0);
  });

  it('subtract removes overlap', () => {
    const result = performBoolean(squareA, squareB, 'subtract');
    expect(result.length).toBeGreaterThan(0);
    // Subtract B from A → 50x100 remaining on left
    const ring = result[0][0];
    const xs = ring.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(0, 0);
    expect(Math.max(...xs)).toBeCloseTo(50, 0);
  });

  it('intersect keeps only overlap', () => {
    const result = performBoolean(squareA, squareB, 'intersect');
    expect(result.length).toBeGreaterThan(0);
    // Intersection = 50x100
    const ring = result[0][0];
    const xs = ring.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(50, 0);
    expect(Math.max(...xs)).toBeCloseTo(100, 0);
  });

  it('exclude removes overlap from both', () => {
    const result = performBoolean(squareA, squareB, 'exclude');
    expect(result.length).toBeGreaterThan(0);
    // Exclude produces two disjoint regions
  });

  it('returns empty for non-overlapping intersect', () => {
    const farSquare = [
      [
        [
          [500, 500],
          [600, 500],
          [600, 600],
          [500, 600],
          [500, 500],
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;
    const result = performBoolean(squareA, farSquare, 'intersect');
    expect(result.length).toBe(0);
  });

  it('intersects a multi-part second operand as a union, not per-piece (F110)', () => {
    // polyB = two disjoint squares: one overlaps A (50..150), one is far away.
    const multiB = [
      [
        [
          [50, 0],
          [150, 0],
          [150, 100],
          [50, 100],
          [50, 0],
        ],
      ],
      [
        [
          [500, 500],
          [600, 500],
          [600, 600],
          [500, 600],
          [500, 500],
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;

    const result = performBoolean(squareA, multiB, 'intersect');
    // A ∩ (B1 ∪ B2) = A ∩ B1 = the 50..100 overlap (non-empty). The old spread
    // bug computed A ∩ B1 ∩ B2 = empty because A does not meet the far square.
    expect(result.length).toBeGreaterThan(0);
    const xs = result[0][0].map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(50, 0);
    expect(Math.max(...xs)).toBeCloseTo(100, 0);
  });
});

// ============================================================================
// polygonToContours
// ============================================================================

describe('polygonToContours', () => {
  it('converts a MultiPolygon result to PathPoint contours', () => {
    const multiPoly = [
      [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;

    const contours = polygonToContours(multiPoly);
    expect(contours.length).toBe(1);
    expect(contours[0].length).toBe(4); // 5 points minus closing duplicate = 4
    // All points should be corner type with null handles
    for (const pt of contours[0]) {
      expect(pt.type).toBe('corner');
      expect(pt.handleIn).toBeNull();
      expect(pt.handleOut).toBeNull();
    }
  });

  it('returns empty for empty MultiPolygon', () => {
    const contours = polygonToContours([]);
    expect(contours.length).toBe(0);
  });

  it('handles multiple rings (polygon with hole)', () => {
    const multiPoly = [
      [
        // outer ring
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
        // inner ring (hole)
        [
          [20, 20],
          [80, 20],
          [80, 80],
          [20, 80],
          [20, 20],
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;

    const contours = polygonToContours(multiPoly);
    expect(contours.length).toBe(2); // outer + hole
  });

  it('skips rings with fewer than 3 points', () => {
    const multiPoly = [
      [
        [
          [0, 0],
          [100, 0],
          [0, 0],
        ], // Only 2 unique points after removing closing duplicate
      ],
    ] as import('polygon-clipping').MultiPolygon;

    const contours = polygonToContours(multiPoly);
    expect(contours.length).toBe(0);
  });

  it('removes duplicate closing point from polygon-clipping output', () => {
    const multiPoly = [
      [
        [
          [0, 0],
          [50, 0],
          [50, 50],
          [0, 50],
          [0, 0], // closing duplicate
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;

    const contours = polygonToContours(multiPoly);
    expect(contours[0].length).toBe(4);
    // First and last should NOT be the same
    const first = contours[0][0];
    const last = contours[0][contours[0].length - 1];
    expect(first.position.x !== last.position.x || first.position.y !== last.position.y).toBe(true);
  });

  it('preserves coordinates correctly', () => {
    const multiPoly = [
      [
        [
          [10, 20],
          [30, 40],
          [50, 60],
          [10, 20],
        ],
      ],
    ] as import('polygon-clipping').MultiPolygon;

    const contours = polygonToContours(multiPoly);
    expect(contours[0][0].position).toEqual({ x: 10, y: 20 });
    expect(contours[0][1].position).toEqual({ x: 30, y: 40 });
    expect(contours[0][2].position).toEqual({ x: 50, y: 60 });
  });
});

// ============================================================================
// createBooleanResultNode
// ============================================================================

describe('createBooleanResultNode', () => {
  const fills: Fill[] = [
    { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true },
  ];
  const strokes: Stroke[] = [
    {
      color: { r: 0, g: 0, b: 0, a: 1 },
      width: 2,
      opacity: 1,
      cap: 'round',
      join: 'round',
      visible: true,
      align: 'center',
    },
  ];

  function makeContour(points: [number, number][]): PathPoint[] {
    return points.map(([x, y]) => ({
      position: { x, y },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    }));
  }

  it('returns null for empty contours', () => {
    const result = createBooleanResultNode([], fills, strokes, 'Test', generateId);
    expect(result).toBeNull();
  });

  it('creates a PathNode from a single contour', () => {
    const contour = makeContour([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]);
    const result = createBooleanResultNode([contour], fills, strokes, 'Union', generateId);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
    expect(result!.name).toBe('Union');
    expect(result!.closed).toBe(true);
    expect(result!.points.length).toBe(4);
    expect(result!.fills).toEqual(fills);
    expect(result!.strokes).toEqual(strokes);
    expect(result!.subpaths).toBeUndefined();
    expect(result!.fillRule).toBeUndefined();
  });

  it('centers contour at AABB center', () => {
    const contour = makeContour([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]);
    const result = createBooleanResultNode([contour], fills, strokes, 'Test', generateId);

    // Center of AABB is (50, 50)
    expect(result!.transform.position.x).toBeCloseTo(50);
    expect(result!.transform.position.y).toBeCloseTo(50);
    // Points should be centered — (0,0)-(100,100) centered around (50,50) = (-50,-50) to (50,50)
    expect(result!.points[0].position.x).toBeCloseTo(-50);
    expect(result!.points[0].position.y).toBeCloseTo(-50);
  });

  it('uses anchor (0.5, 0.5)', () => {
    const contour = makeContour([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const result = createBooleanResultNode([contour], fills, strokes, 'Test', generateId);
    expect(result!.transform.anchor).toEqual({ x: 0.5, y: 0.5 });
  });

  it('creates subpaths for multiple contours with evenodd fillRule', () => {
    const outer = makeContour([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]);
    const inner = makeContour([
      [20, 20],
      [80, 20],
      [80, 80],
      [20, 80],
    ]);
    const result = createBooleanResultNode([outer, inner], fills, strokes, 'Exclude', generateId);

    expect(result).not.toBeNull();
    expect(result!.subpaths).toBeDefined();
    expect(result!.subpaths!.length).toBe(1);
    expect(result!.fillRule).toBe('evenodd');
  });

  it('assigns unique ID via generateId', () => {
    const contour = makeContour([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const ids: string[] = [];
    const result = createBooleanResultNode([contour], fills, strokes, 'Test', () => {
      const id = `unique-${ids.length}`;
      ids.push(id);
      return id;
    });
    expect(result!.id).toBe('unique-0');
  });

  it('handles empty fills and strokes arrays', () => {
    const contour = makeContour([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const result = createBooleanResultNode([contour], [], [], 'Test', generateId);
    expect(result!.fills).toEqual([]);
    expect(result!.strokes).toEqual([]);
  });
});

// ============================================================================
// booleanOperation (high-level)
// ============================================================================

describe('booleanOperation', () => {
  it('returns null for fewer than 2 nodes', () => {
    const rect = makeRect('r1', 0, 0, 100, 100);
    const result = booleanOperation([rect], [nodeTransform(rect)], 'union', generateId);
    expect(result).toBeNull();
  });

  it('returns null for empty nodes array', () => {
    const result = booleanOperation([], [], 'union', generateId);
    expect(result).toBeNull();
  });

  const makeNestedGroup = (): Node =>
    ({
      id: 'nested',
      name: 'nested',
      type: 'group',
      parent: null,
      children: ['R1', 'R2'],
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
      booleanOp: 'union',
    }) as unknown as Node;

  it('preserves a nested boolean group child when flattening (F031)', () => {
    const rectA = makeRect('A', 0, 0, 40, 40); // near the origin
    const r1 = makeRect('R1', 200, 0, 40, 40); // far away, overlapping R2
    const r2 = makeRect('R2', 220, 0, 40, 40);
    const nested = makeNestedGroup();

    const resolver = (group: Node) =>
      group.id === 'nested'
        ? { children: [r1, r2], worldTransforms: [nodeTransform(r1), nodeTransform(r2)] }
        : null;

    const transforms = [nodeTransform(rectA), mat3.identity()];
    const maxX = (r: PathNode | null): number =>
      Math.max(
        ...(r ? r.points.map((p) => p.position.x) : [0]),
        ...((r?.subpaths ?? []).flat().map((p) => p.position.x) as number[])
      );

    // Without a resolver the nested boolean group cannot be converted and is
    // dropped, leaving only rectA. With the resolver its geometry survives.
    const without = booleanOperation([rectA, nested], transforms, 'union', generateId);
    const withResolver = booleanOperation(
      [rectA, nested],
      transforms,
      'union',
      generateId,
      resolver
    );

    expect(withResolver).not.toBeNull();
    expect(maxX(withResolver)).toBeGreaterThan(maxX(without) + 50);
  });

  it('returns non-null with the nested group as the first operand (F031)', () => {
    const r1 = makeRect('R1', 200, 0, 40, 40);
    const r2 = makeRect('R2', 220, 0, 40, 40);
    const rectA = makeRect('A', 210, 0, 40, 40); // overlaps the nested region
    const nested = makeNestedGroup();

    const resolver = (group: Node) =>
      group.id === 'nested'
        ? { children: [r1, r2], worldTransforms: [nodeTransform(r1), nodeTransform(r2)] }
        : null;

    const result = booleanOperation(
      [nested, rectA],
      [mat3.identity(), nodeTransform(rectA)],
      'union',
      generateId,
      resolver
    );
    expect(result).not.toBeNull();
  });

  it('performs union on two overlapping rectangles', () => {
    const r1 = makeRect('r1', 50, 50, 100, 100);
    const r2 = makeRect('r2', 100, 50, 100, 100);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'union',
      generateId
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
    expect(result!.name).toBe('Union');
    expect(result!.closed).toBe(true);
  });

  it('inherits fills from the first node', () => {
    const r1 = makeRect('r1', 50, 50, 100, 100);
    const r2 = makeRect('r2', 100, 50, 100, 100);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'union',
      generateId
    );

    expect(result!.fills[0]).toEqual((r1 as unknown as { fills: Fill[] }).fills[0]);
  });

  it('inherits strokes from the first node', () => {
    const r1 = makeRect('r1', 50, 50, 100, 100);
    const r2 = makeRect('r2', 100, 50, 100, 100);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'union',
      generateId
    );

    expect(result!.strokes[0]).toEqual((r1 as unknown as { strokes: Stroke[] }).strokes[0]);
  });

  it('performs subtract', () => {
    const r1 = makeRect('r1', 50, 50, 100, 100);
    const r2 = makeRect('r2', 100, 50, 100, 100);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'subtract',
      generateId
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Subtract');
  });

  it('performs intersect', () => {
    const r1 = makeRect('r1', 50, 50, 100, 100);
    const r2 = makeRect('r2', 100, 50, 100, 100);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'intersect',
      generateId
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Intersect');
  });

  it('performs exclude', () => {
    const r1 = makeRect('r1', 50, 50, 100, 100);
    const r2 = makeRect('r2', 100, 50, 100, 100);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'exclude',
      generateId
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Exclude');
  });

  it('returns null for non-overlapping intersect', () => {
    const r1 = makeRect('r1', 0, 0, 10, 10);
    const r2 = makeRect('r2', 1000, 1000, 10, 10);
    const result = booleanOperation(
      [r1, r2],
      [nodeTransform(r1), nodeTransform(r2)],
      'intersect',
      generateId
    );

    expect(result).toBeNull();
  });

  it('handles 3+ nodes', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const r3 = makeRect('r3', 100, 0, 100, 100);
    const result = booleanOperation(
      [r1, r2, r3],
      [nodeTransform(r1), nodeTransform(r2), nodeTransform(r3)],
      'union',
      generateId
    );

    expect(result).not.toBeNull();
    expect(result!.points.length).toBeGreaterThanOrEqual(4);
  });

  it('works with mixed node types', () => {
    const rect = makeRect('r1', 50, 50, 100, 100);
    const ellipse = makeEllipse('e1', 100, 50, 50, 50);
    const result = booleanOperation(
      [rect, ellipse],
      [nodeTransform(rect), nodeTransform(ellipse)],
      'union',
      generateId
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe('path');
  });

  it('skips unsupported nodes gracefully', () => {
    const rect = makeRect('r1', 0, 0, 100, 100);
    const group = {
      id: 'g1',
      name: 'g1',
      type: 'group',
      parent: null,
      children: [],
      transform: {
        position: { x: 50, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    } as unknown as Node;

    // group is unsupported, but rect should still produce a result
    // (the group is skipped via `if (!poly) continue`)
    const result = booleanOperation(
      [rect, group],
      [nodeTransform(rect), mat3.identity()],
      'union',
      generateId
    );

    // With only one valid polygon and one skip, accum stays as rect polygon
    // Result depends on implementation — accum is still valid, just the rect
    expect(result).not.toBeNull();
  });
});
