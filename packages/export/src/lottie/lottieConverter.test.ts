import { describe, it, expect } from 'vitest';
import type {
  RectangleNode,
  EllipseNode,
  PathNode,
  PolygonNode,
  GroupNode,
  Timeline,
  Transform,
  Fill,
  Stroke,
  Color,
  PathPoint,
} from '@quar/types';
import {
  nodeToLottieLayer,
  nodeToLottieShapes,
  rectangleToLottieShapes,
  ellipseToLottieShapes,
  pathToLottieShapes,
  polygonToLottieShapes,
  groupToLottieShapes,
  pathPointsToLottieVertices,
  fillsToLottie,
  strokesToLottie,
  buildLottieTransform,
  generatePolygonPoints,
} from './lottieConverter';
import type {
  LottieShapeRect,
  LottieShapeEllipse,
  LottieShapePath,
  LottieShapeFill,
  LottieShapeStroke,
} from './lottieTypes';

// ============================================================================
// Test Helpers
// ============================================================================

const defaultTransform: Transform = {
  position: { x: 100, y: 200 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
  skew: { x: 0, y: 0 },
};

const solidFill: Fill = {
  type: 'solid',
  color: { r: 255, g: 0, b: 0, a: 1 },
  opacity: 1,
  visible: true,
};
const solidStroke: Stroke = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  width: 2,
  opacity: 1,
  cap: 'round',
  join: 'miter',
  visible: true,
};

function makeRect(overrides?: Partial<RectangleNode>): RectangleNode {
  return {
    id: 'rect-1',
    name: 'Rectangle',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [8, 8, 8, 8],
    fills: [solidFill],
    strokes: [solidStroke],
    ...overrides,
  };
}

function makeEllipse(overrides?: Partial<EllipseNode>): EllipseNode {
  return {
    id: 'ell-1',
    name: 'Ellipse',
    type: 'ellipse',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: 50,
    radiusY: 30,
    fills: [solidFill],
    strokes: [],
    ...overrides,
  };
}

function makePath(overrides?: Partial<PathNode>): PathNode {
  return {
    id: 'path-1',
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 10, y: 20 }, type: 'smooth' },
      { position: { x: 50, y: 50 }, handleIn: { x: 40, y: 30 }, handleOut: null, type: 'corner' },
    ],
    closed: false,
    fills: [solidFill],
    strokes: [],
    ...overrides,
  };
}

function makePolygon(overrides?: Partial<PolygonNode>): PolygonNode {
  return {
    id: 'poly-1',
    name: 'Polygon',
    type: 'polygon',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides: 6,
    radius: 50,
    fills: [solidFill],
    strokes: [],
    ...overrides,
  };
}

const emptyTimeline: Timeline = {
  id: 'tl-1',
  name: 'Timeline',
  duration: 60,
  frameRate: 30,
  tracks: [],
  markers: [],
};

const CANVAS_H = 500;

// ============================================================================
// nodeToLottieLayer
// ============================================================================

describe('nodeToLottieLayer', () => {
  it('converts a rectangle node to a shape layer', () => {
    const node = makeRect();
    const layer = nodeToLottieLayer(node, emptyTimeline, 0, CANVAS_H, 60);
    expect(layer).not.toBeNull();
    expect(layer!.ty).toBe(4); // Shape layer
    expect(layer!.nm).toBe('Rectangle');
    expect(layer!.ind).toBe(0);
    expect(layer!.ip).toBe(0);
    expect(layer!.op).toBe(60);
    expect(layer!.shapes).toBeDefined();
    expect(layer!.shapes!.length).toBeGreaterThan(0);
  });

  it('returns null for unsupported node types', () => {
    const textNode = {
      id: 'text-1',
      name: 'Text',
      type: 'text' as const,
      parent: null,
      children: [],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      content: 'Hello',
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      fontStyle: 'normal' as const,
      textAlign: 'left' as const,
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [],
      strokes: [],
    };
    const layer = nodeToLottieLayer(textNode, emptyTimeline, 0, CANVAS_H, 60);
    expect(layer).toBeNull();
  });

  it('uses node name for layer name', () => {
    const node = makeRect({ name: 'My Custom Rect' });
    const layer = nodeToLottieLayer(node, emptyTimeline, 5, CANVAS_H, 60);
    expect(layer!.nm).toBe('My Custom Rect');
  });
});

// ============================================================================
// rectangleToLottieShapes
// ============================================================================

describe('rectangleToLottieShapes', () => {
  it('produces rect shape + fill + stroke + transform items', () => {
    const node = makeRect();
    const shapes = rectangleToLottieShapes(node, emptyTimeline, CANVAS_H);
    expect(shapes.length).toBe(4); // rc + fl + st + tr

    const rc = shapes[0] as LottieShapeRect;
    expect(rc.ty).toBe('rc');
    expect((rc.s.k as number[])[0]).toBe(100); // width
    expect((rc.s.k as number[])[1]).toBe(50); // height
    expect(rc.r.k as number).toBe(8); // cornerRadius
  });

  it('handles zero corner radius', () => {
    const node = makeRect({ cornerRadius: [0, 0, 0, 0] });
    const shapes = rectangleToLottieShapes(node, emptyTimeline, CANVAS_H);
    const rc = shapes[0] as LottieShapeRect;
    expect(rc.r.k).toBe(0);
  });

  it('skips invisible fills', () => {
    const node = makeRect({
      fills: [{ ...solidFill, visible: false }],
      strokes: [],
    });
    const shapes = rectangleToLottieShapes(node, emptyTimeline, CANVAS_H);
    // rc + tr only (no fill, no stroke)
    expect(shapes.length).toBe(2);
  });
});

// ============================================================================
// ellipseToLottieShapes
// ============================================================================

describe('ellipseToLottieShapes', () => {
  it('produces ellipse shape with diameter-based size', () => {
    const node = makeEllipse();
    const shapes = ellipseToLottieShapes(node, emptyTimeline, CANVAS_H);
    expect(shapes.length).toBeGreaterThanOrEqual(2); // el + fl + tr

    const el = shapes[0] as LottieShapeEllipse;
    expect(el.ty).toBe('el');
    // Lottie ellipse size is diameter (2x radius)
    const size = el.s.k as number[];
    expect(size[0]).toBe(100); // 50 * 2
    expect(size[1]).toBe(60); // 30 * 2
  });
});

// ============================================================================
// pathToLottieShapes
// ============================================================================

describe('pathToLottieShapes', () => {
  it('converts path points to Lottie shape', () => {
    const node = makePath();
    const shapes = pathToLottieShapes(node, emptyTimeline, CANVAS_H);
    expect(shapes.length).toBeGreaterThanOrEqual(2); // sh + fl + tr

    const sh = shapes[0] as LottieShapePath;
    expect(sh.ty).toBe('sh');
    const verts = sh.ks.k as { v: number[][]; i: number[][]; o: number[][]; c: boolean };
    expect(verts.v).toHaveLength(2);
    expect(verts.c).toBe(false);
  });

  it('handles subpaths', () => {
    const node = makePath({
      subpaths: [
        [
          { position: { x: 10, y: 10 }, handleIn: null, handleOut: null, type: 'corner' as const },
          { position: { x: 20, y: 20 }, handleIn: null, handleOut: null, type: 'corner' as const },
        ],
      ],
    });
    const shapes = pathToLottieShapes(node, emptyTimeline, CANVAS_H);
    // Primary path + 1 subpath + fill + tr
    const pathShapes = shapes.filter((s) => s.ty === 'sh');
    expect(pathShapes.length).toBe(2);
  });

  it('passes fillRule to fill', () => {
    const node = makePath({ fillRule: 'evenodd' });
    const shapes = pathToLottieShapes(node, emptyTimeline, CANVAS_H);
    const fill = shapes.find((s) => s.ty === 'fl') as LottieShapeFill;
    expect(fill.r).toBe(2); // evenodd
  });
});

// ============================================================================
// polygonToLottieShapes
// ============================================================================

describe('polygonToLottieShapes', () => {
  it('converts polygon to path shape', () => {
    const node = makePolygon();
    const shapes = polygonToLottieShapes(node, emptyTimeline, CANVAS_H);
    expect(shapes.length).toBeGreaterThanOrEqual(2);

    const sh = shapes[0] as LottieShapePath;
    expect(sh.ty).toBe('sh');
    const verts = sh.ks.k as { v: number[][]; c: boolean };
    expect(verts.v).toHaveLength(6); // hexagon
    expect(verts.c).toBe(true);
  });

  it('handles star shapes with inner radius', () => {
    const node = makePolygon({ sides: 5, innerRadius: 25 });
    const shapes = polygonToLottieShapes(node, emptyTimeline, CANVAS_H);
    const sh = shapes[0] as LottieShapePath;
    const verts = sh.ks.k as { v: number[][] };
    expect(verts.v).toHaveLength(10); // 5 outer + 5 inner
  });
});

// ============================================================================
// pathPointsToLottieVertices
// ============================================================================

describe('pathPointsToLottieVertices', () => {
  it('converts simple corner points', () => {
    const points: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 100 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    const result = pathPointsToLottieVertices(points, true);
    expect(result.v).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    expect(result.i).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(result.o).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(result.c).toBe(true);
  });

  it('converts handles as relative offsets', () => {
    const points: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 20, y: 10 }, type: 'smooth' },
      { position: { x: 50, y: 50 }, handleIn: { x: 30, y: 40 }, handleOut: null, type: 'smooth' },
    ];
    const result = pathPointsToLottieVertices(points, false);
    expect(result.v).toEqual([
      [0, 0],
      [50, 50],
    ]);
    expect(result.o[0]).toEqual([20, 10]); // handleOut - position
    expect(result.i[1]).toEqual([-20, -10]); // handleIn - position
    expect(result.c).toBe(false);
  });

  it('handles empty points array', () => {
    const result = pathPointsToLottieVertices([], true);
    expect(result.v).toEqual([]);
    expect(result.c).toBe(true);
  });
});

// ============================================================================
// fillsToLottie
// ============================================================================

describe('fillsToLottie', () => {
  it('converts solid fill', () => {
    const fills: Fill[] = [solidFill];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result).toHaveLength(1);
    expect(result[0].ty).toBe('fl');
    const c = result[0].c.k as number[];
    expect(c[0]).toBeCloseTo(1); // R
    expect(c[1]).toBe(0); // G
    expect(c[2]).toBe(0); // B
  });

  it('skips invisible fills', () => {
    const fills: Fill[] = [{ ...solidFill, visible: false }];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });

  it('skips gradient fills', () => {
    const fills: Fill[] = [{ type: 'gradient', opacity: 1, visible: true }];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });

  it('skips none fills', () => {
    const fills: Fill[] = [{ type: 'none', opacity: 1, visible: true }];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });

  it('handles undefined fills', () => {
    const result = fillsToLottie(undefined, 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });

  it('sets fill opacity', () => {
    const fills: Fill[] = [{ ...solidFill, opacity: 0.5 }];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result[0].o.k as number).toBe(50);
  });

  it('sets evenodd fill rule', () => {
    const fills: Fill[] = [solidFill];
    const result = fillsToLottie(fills, 'n1', emptyTimeline, 'evenodd');
    expect(result[0].r).toBe(2);
  });
});

// ============================================================================
// strokesToLottie
// ============================================================================

describe('strokesToLottie', () => {
  it('converts solid stroke', () => {
    const strokes: Stroke[] = [solidStroke];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result).toHaveLength(1);
    expect(result[0].ty).toBe('st');
    expect(result[0].w.k as number).toBe(2);
    expect(result[0].lc).toBe(2); // round
    expect(result[0].lj).toBe(1); // miter
  });

  it('skips invisible strokes', () => {
    const strokes: Stroke[] = [{ ...solidStroke, visible: false }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });

  it('handles undefined strokes', () => {
    const result = strokesToLottie(undefined, 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });

  it('includes miter limit when set', () => {
    const strokes: Stroke[] = [{ ...solidStroke, miterLimit: 10 }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].ml).toBe(10);
  });
});

// ============================================================================
// buildLottieTransform
// ============================================================================

describe('buildLottieTransform', () => {
  it('builds static transform with Y-flip', () => {
    const t = buildLottieTransform(defaultTransform, 'n1', emptyTimeline, CANVAS_H);
    // Position Y should be flipped: 500 - 200 = 300
    const pos = t.p.k as number[];
    expect(pos[0]).toBe(100);
    expect(pos[1]).toBe(300);
    // Scale should be 100%
    const scale = t.s.k as number[];
    expect(scale[0]).toBe(100);
    expect(scale[1]).toBe(100);
    // Opacity should be 100
    expect(t.o.k).toBe(100);
  });

  it('negates rotation for Y-flip', () => {
    const transform: Transform = { ...defaultTransform, rotation: 45 };
    const t = buildLottieTransform(transform, 'n1', emptyTimeline, CANVAS_H);
    expect(t.r.k).toBe(-45);
  });

  it('handles animated transform with tracks', () => {
    const timeline: Timeline = {
      ...emptyTimeline,
      tracks: [
        {
          id: 't1',
          nodeId: 'n1',
          property: 'transform.position.x',
          keyframes: [
            { id: 'k1', time: 0, value: 0, easing: 'linear' },
            { id: 'k2', time: 30, value: 200, easing: 'linear' },
          ],
        },
      ],
    };
    const t = buildLottieTransform(defaultTransform, 'n1', timeline, CANVAS_H);
    expect(t.p.a).toBe(1); // Animated
  });
});

// ============================================================================
// generatePolygonPoints
// ============================================================================

describe('generatePolygonPoints', () => {
  it('generates correct number of points for polygon', () => {
    const node = makePolygon({ sides: 5, radius: 50 });
    const points = generatePolygonPoints(node);
    expect(points).toHaveLength(5);
  });

  it('generates double points for star', () => {
    const node = makePolygon({ sides: 5, radius: 50, innerRadius: 25 });
    const points = generatePolygonPoints(node);
    expect(points).toHaveLength(10);
  });

  it('star points alternate between outer and inner radius', () => {
    const node = makePolygon({ sides: 4, radius: 100, innerRadius: 50 });
    const points = generatePolygonPoints(node);
    // Even indices should be at outer radius (100), odd at inner (50)
    for (let i = 0; i < points.length; i++) {
      const dist = Math.sqrt(points[i].position.x ** 2 + points[i].position.y ** 2);
      if (i % 2 === 0) {
        expect(dist).toBeCloseTo(100);
      } else {
        expect(dist).toBeCloseTo(50);
      }
    }
  });

  it('all points are corner type with no handles', () => {
    const node = makePolygon();
    const points = generatePolygonPoints(node);
    for (const p of points) {
      expect(p.type).toBe('corner');
      expect(p.handleIn).toBeNull();
      expect(p.handleOut).toBeNull();
    }
  });
});

// ============================================================================
// groupToLottieShapes
// ============================================================================

describe('groupToLottieShapes', () => {
  it('returns empty array', () => {
    const result = groupToLottieShapes();
    expect(result).toEqual([]);
  });
});

// ============================================================================
// nodeToLottieShapes routing
// ============================================================================

describe('nodeToLottieShapes', () => {
  it('routes rectangle', () => {
    const shapes = nodeToLottieShapes(makeRect(), emptyTimeline, CANVAS_H);
    expect(shapes).not.toBeNull();
    expect(shapes!.some((s) => s.ty === 'rc')).toBe(true);
  });

  it('routes ellipse', () => {
    const shapes = nodeToLottieShapes(makeEllipse(), emptyTimeline, CANVAS_H);
    expect(shapes).not.toBeNull();
    expect(shapes!.some((s) => s.ty === 'el')).toBe(true);
  });

  it('routes path', () => {
    const shapes = nodeToLottieShapes(makePath(), emptyTimeline, CANVAS_H);
    expect(shapes).not.toBeNull();
    expect(shapes!.some((s) => s.ty === 'sh')).toBe(true);
  });

  it('routes polygon', () => {
    const shapes = nodeToLottieShapes(makePolygon(), emptyTimeline, CANVAS_H);
    expect(shapes).not.toBeNull();
    expect(shapes!.some((s) => s.ty === 'sh')).toBe(true);
  });

  it('returns null for unsupported types', () => {
    const bone = {
      id: 'b1',
      name: 'Bone',
      type: 'bone' as const,
      parent: null,
      children: [],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      length: 100,
      boneStyle: 'stick' as const,
      boneColor: '#fff',
    };
    expect(nodeToLottieShapes(bone, emptyTimeline, CANVAS_H)).toBeNull();
  });

  it('routes group and returns empty array', () => {
    const group: GroupNode = {
      id: 'g1',
      name: 'Group',
      type: 'group',
      parent: null,
      children: [],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    };
    const shapes = nodeToLottieShapes(group, emptyTimeline, CANVAS_H);
    expect(shapes).not.toBeNull();
    expect(shapes).toEqual([]);
  });
});

// ============================================================================
// Additional nodeToLottieLayer tests
// ============================================================================

describe('nodeToLottieLayer - additional', () => {
  it('uses fallback name when node name is empty', () => {
    const node = makeRect({ name: '' });
    const layer = nodeToLottieLayer(node, emptyTimeline, 3, CANVAS_H, 60);
    expect(layer!.nm).toBe('Layer 3');
  });

  it('returns null for group with no children shapes', () => {
    const group: GroupNode = {
      id: 'g1',
      name: 'Group',
      type: 'group',
      parent: null,
      children: [],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    };
    const layer = nodeToLottieLayer(group, emptyTimeline, 0, CANVAS_H, 60);
    // groupToLottieShapes returns [], so null since shapes.length === 0
    expect(layer).toBeNull();
  });
});

// ============================================================================
// Additional pathPointsToLottieVertices tests
// ============================================================================

describe('pathPointsToLottieVertices - additional', () => {
  it('handles single point', () => {
    const points: PathPoint[] = [
      { position: { x: 50, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    const result = pathPointsToLottieVertices(points, false);
    expect(result.v).toHaveLength(1);
    expect(result.v[0]).toEqual([50, 50]);
    expect(result.i[0]).toEqual([0, 0]);
    expect(result.o[0]).toEqual([0, 0]);
  });

  it('handles point with both handles', () => {
    const points: PathPoint[] = [
      {
        position: { x: 100, y: 100 },
        handleIn: { x: 80, y: 90 },
        handleOut: { x: 120, y: 110 },
        type: 'smooth',
      },
    ];
    const result = pathPointsToLottieVertices(points, true);
    expect(result.v[0]).toEqual([100, 100]);
    expect(result.i[0]).toEqual([-20, -10]); // 80-100, 90-100
    expect(result.o[0]).toEqual([20, 10]); // 120-100, 110-100
  });
});

// ============================================================================
// Additional fillsToLottie tests
// ============================================================================

describe('fillsToLottie - additional', () => {
  it('nonzero fillRule does not set r field', () => {
    const fills: Fill[] = [solidFill];
    const result = fillsToLottie(fills, 'n1', emptyTimeline, 'nonzero');
    expect(result[0].r).toBeUndefined();
  });

  it('no fillRule does not set r field', () => {
    const fills: Fill[] = [solidFill];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result[0].r).toBeUndefined();
  });

  it('converts multiple fills', () => {
    const blue: Fill = {
      type: 'solid',
      color: { r: 0, g: 0, b: 255, a: 1 },
      opacity: 0.8,
      visible: true,
    };
    const fills: Fill[] = [solidFill, blue];
    const result = fillsToLottie(fills, 'n1', emptyTimeline);
    expect(result).toHaveLength(2);
    expect(result[0].nm).toBe('Fill 1');
    expect(result[1].nm).toBe('Fill 2');
    expect(result[1].o.k).toBe(80); // 0.8 * 100
  });

  it('skips fills without color', () => {
    const noColor: Fill = { type: 'solid', opacity: 1, visible: true };
    const result = fillsToLottie([noColor], 'n1', emptyTimeline);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// Additional strokesToLottie tests
// ============================================================================

describe('strokesToLottie - additional', () => {
  it('maps butt cap to 1', () => {
    const strokes: Stroke[] = [{ ...solidStroke, cap: 'butt' }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].lc).toBe(1);
  });

  it('maps square cap to 3', () => {
    const strokes: Stroke[] = [{ ...solidStroke, cap: 'square' }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].lc).toBe(3);
  });

  it('maps round join to 2', () => {
    const strokes: Stroke[] = [{ ...solidStroke, join: 'round' }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].lj).toBe(2);
  });

  it('maps bevel join to 3', () => {
    const strokes: Stroke[] = [{ ...solidStroke, join: 'bevel' }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].lj).toBe(3);
  });

  it('defaults unknown cap/join to round/miter', () => {
    const strokes: Stroke[] = [
      {
        ...solidStroke,
        cap: 'unknown' as Stroke['cap'],
        join: 'unknown' as Stroke['join'],
      },
    ];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].lc).toBe(2); // fallback round
    expect(result[0].lj).toBe(1); // fallback miter
  });

  it('omits miterLimit when not set', () => {
    const strokes: Stroke[] = [{ ...solidStroke, miterLimit: undefined }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].ml).toBeUndefined();
  });

  it('converts multiple strokes', () => {
    const strokes: Stroke[] = [
      { ...solidStroke, width: 2 },
      { ...solidStroke, width: 5, cap: 'butt' },
    ];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result).toHaveLength(2);
    expect(result[0].nm).toBe('Stroke 1');
    expect(result[1].nm).toBe('Stroke 2');
    expect(result[1].w.k).toBe(5);
    expect(result[1].lc).toBe(1); // butt
  });

  it('sets stroke opacity', () => {
    const strokes: Stroke[] = [{ ...solidStroke, opacity: 0.3 }];
    const result = strokesToLottie(strokes, 'n1', emptyTimeline);
    expect(result[0].o.k).toBe(30);
  });
});

// ============================================================================
// Additional buildLottieTransform tests
// ============================================================================

describe('buildLottieTransform - additional', () => {
  it('handles animated rotation track', () => {
    const timeline: Timeline = {
      ...emptyTimeline,
      tracks: [
        {
          id: 't1',
          nodeId: 'n1',
          property: 'transform.rotation',
          keyframes: [
            { id: 'k1', time: 0, value: 0, easing: 'linear' },
            { id: 'k2', time: 30, value: 360, easing: 'linear' },
          ],
        },
      ],
    };
    const t = buildLottieTransform(defaultTransform, 'n1', timeline, CANVAS_H);
    expect(t.r.a).toBe(1);
  });

  it('handles animated scale tracks', () => {
    const timeline: Timeline = {
      ...emptyTimeline,
      tracks: [
        {
          id: 't1',
          nodeId: 'n1',
          property: 'transform.scale.x',
          keyframes: [
            { id: 'k1', time: 0, value: 1, easing: 'linear' },
            { id: 'k2', time: 30, value: 2, easing: 'linear' },
          ],
        },
      ],
    };
    const t = buildLottieTransform(defaultTransform, 'n1', timeline, CANVAS_H);
    expect(t.s.a).toBe(1);
  });

  it('handles animated opacity track', () => {
    const timeline: Timeline = {
      ...emptyTimeline,
      tracks: [
        {
          id: 't1',
          nodeId: 'n1',
          property: 'opacity',
          keyframes: [
            { id: 'k1', time: 0, value: 1, easing: 'linear' },
            { id: 'k2', time: 30, value: 0, easing: 'linear' },
          ],
        },
      ],
    };
    const t = buildLottieTransform(defaultTransform, 'n1', timeline, CANVAS_H);
    expect(t.o.a).toBe(1);
  });

  it('handles undefined opacity (defaults to 1 → 100)', () => {
    const transform: Transform = { ...defaultTransform };
    delete (transform as Record<string, unknown>)['opacity'];
    const t = buildLottieTransform(transform, 'n1', emptyTimeline, CANVAS_H);
    expect(t.o.k).toBe(100);
  });

  it('anchor is always at [0,0]', () => {
    const t = buildLottieTransform(defaultTransform, 'n1', emptyTimeline, CANVAS_H);
    expect(t.a.k).toEqual([0, 0]);
    expect(t.a.a).toBe(0);
  });
});

// ============================================================================
// Additional generatePolygonPoints tests
// ============================================================================

describe('generatePolygonPoints - additional', () => {
  it('generates 3 points for triangle', () => {
    const node = makePolygon({ sides: 3, radius: 100 });
    const points = generatePolygonPoints(node);
    expect(points).toHaveLength(3);
    // All at radius 100
    for (const p of points) {
      const dist = Math.sqrt(p.position.x ** 2 + p.position.y ** 2);
      expect(dist).toBeCloseTo(100);
    }
  });

  it('does not treat innerRadius=0 as star', () => {
    const node = makePolygon({ sides: 5, radius: 50, innerRadius: 0 });
    const points = generatePolygonPoints(node);
    // innerRadius=0 means isStar is false (innerRadius > 0 check fails)
    expect(points).toHaveLength(5);
  });

  it('first point starts from top (-π/2)', () => {
    const node = makePolygon({ sides: 4, radius: 100 });
    const points = generatePolygonPoints(node);
    // First point at angle -π/2 → (cos(-π/2)*100, sin(-π/2)*100) = (0, -100)
    expect(points[0].position.x).toBeCloseTo(0);
    expect(points[0].position.y).toBeCloseTo(-100);
  });
});
