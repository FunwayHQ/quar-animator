import { describe, it, expect, beforeEach } from 'vitest';
import {
  pathPointsToSvgD,
  fillToSvgAttrs,
  strokeToSvgAttrs,
  transformToSvgAttr,
  nodeToSvgElement,
  exportNodesToSvg,
} from '../svgExporter';
import { SceneGraph } from '../../SceneGraph';
import type {
  PathPoint,
  PathNode,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  GroupNode,
  TextNode,
  ImageNode,
  Fill,
  Stroke,
  Transform,
  Color,
} from '@quar/types';

// ============================================================================
// Helpers
// ============================================================================

function makeTransform(overrides?: Partial<Transform>): Transform {
  return {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0, y: 0 },
    skew: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeColor(r = 255, g = 0, b = 0, a = 1): Color {
  return { r, g, b, a };
}

function makeSolidFill(color = makeColor(), opacity = 1): Fill {
  return { type: 'solid', color, opacity, visible: true };
}

function makeStroke(color = makeColor(0, 0, 0), width = 2, opacity = 1): Stroke {
  return {
    color,
    width,
    opacity,
    cap: 'butt',
    join: 'miter',
    visible: true,
  };
}

function makeBaseNodeFields(id: string, type: string, overrides?: Record<string, unknown>) {
  return {
    id,
    name: id,
    type,
    parent: null,
    children: [],
    transform: makeTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    ...overrides,
  };
}

let sceneGraph: SceneGraph;

beforeEach(() => {
  sceneGraph = new SceneGraph();
});

// ============================================================================
// pathPointsToSvgD
// ============================================================================

describe('pathPointsToSvgD', () => {
  it('returns empty string for empty points', () => {
    expect(pathPointsToSvgD([], false)).toBe('');
  });

  it('generates M/L commands for straight line path', () => {
    const points: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    const d = pathPointsToSvgD(points, false);
    expect(d).toBe('M0,0L100,0L100,50');
  });

  it('appends Z for closed paths', () => {
    const points: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 50, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    const d = pathPointsToSvgD(points, true);
    expect(d).toContain('Z');
    expect(d).toMatch(/^M.*L.*L.*L.*Z$/);
  });

  it('generates C commands for bezier curves', () => {
    const points: PathPoint[] = [
      {
        position: { x: 0, y: 0 },
        handleIn: null,
        handleOut: { x: 30, y: 0 },
        type: 'smooth',
      },
      {
        position: { x: 100, y: 100 },
        handleIn: { x: -30, y: 0 },
        handleOut: null,
        type: 'smooth',
      },
    ];
    const d = pathPointsToSvgD(points, false);
    expect(d).toContain('C');
    // C cp1x,cp1y cp2x,cp2y x,y
    expect(d).toMatch(/C30,0 70,100 100,100/);
  });
});

// ============================================================================
// fillToSvgAttrs
// ============================================================================

describe('fillToSvgAttrs', () => {
  it('returns fill="none" for undefined fill', () => {
    const defs: string[] = [];
    expect(fillToSvgAttrs(undefined, defs)).toBe('fill="none"');
  });

  it('returns fill="none" for invisible fill', () => {
    const defs: string[] = [];
    const fill: Fill = { type: 'solid', color: makeColor(), opacity: 1, visible: false };
    expect(fillToSvgAttrs(fill, defs)).toBe('fill="none"');
  });

  it('returns solid fill with hex color', () => {
    const defs: string[] = [];
    const result = fillToSvgAttrs(makeSolidFill(makeColor(255, 128, 0)), defs);
    expect(result).toContain('fill="#ff8000"');
  });

  it('includes fill-opacity when < 1', () => {
    const defs: string[] = [];
    const result = fillToSvgAttrs(makeSolidFill(makeColor(255, 0, 0), 0.5), defs);
    expect(result).toContain('fill-opacity="0.5"');
  });

  it('generates gradient def and url reference for gradient fill', () => {
    const defs: string[] = [];
    const fill: Fill = {
      type: 'gradient',
      gradient: {
        type: 'linear',
        stops: [
          { offset: 0, color: makeColor(255, 0, 0) },
          { offset: 1, color: makeColor(0, 0, 255) },
        ],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
      },
      opacity: 1,
      visible: true,
    };
    const result = fillToSvgAttrs(fill, defs);
    expect(result).toMatch(/fill="url\(#grad_\d+\)"/);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toContain('<linearGradient');
    expect(defs[0]).toContain('stop-color="#ff0000"');
    expect(defs[0]).toContain('stop-color="#0000ff"');
  });

  it('generates radial gradient def', () => {
    const defs: string[] = [];
    const fill: Fill = {
      type: 'gradient',
      gradient: {
        type: 'radial',
        stops: [
          { offset: 0, color: makeColor(255, 255, 255) },
          { offset: 1, color: makeColor(0, 0, 0) },
        ],
        center: { x: 0.5, y: 0.5 },
        radius: 0.5,
      },
      opacity: 1,
      visible: true,
    };
    fillToSvgAttrs(fill, defs);
    expect(defs[0]).toContain('<radialGradient');
    expect(defs[0]).toContain('cx="50%"');
  });
});

// ============================================================================
// strokeToSvgAttrs
// ============================================================================

describe('strokeToSvgAttrs', () => {
  it('returns empty string for undefined stroke', () => {
    const defs: string[] = [];
    expect(strokeToSvgAttrs(undefined, defs)).toBe('');
  });

  it('returns empty string for invisible stroke', () => {
    const defs: string[] = [];
    const stroke = makeStroke();
    stroke.visible = false;
    expect(strokeToSvgAttrs(stroke, defs)).toBe('');
  });

  it('returns stroke attrs for solid stroke', () => {
    const defs: string[] = [];
    const result = strokeToSvgAttrs(makeStroke(makeColor(0, 0, 0), 3), defs);
    expect(result).toContain('stroke="#000000"');
    expect(result).toContain('stroke-width="3"');
  });

  it('includes stroke-linecap and stroke-linejoin', () => {
    const defs: string[] = [];
    const stroke = makeStroke();
    stroke.cap = 'round';
    stroke.join = 'bevel';
    const result = strokeToSvgAttrs(stroke, defs);
    expect(result).toContain('stroke-linecap="round"');
    expect(result).toContain('stroke-linejoin="bevel"');
  });

  it('includes dash array when present', () => {
    const defs: string[] = [];
    const stroke = makeStroke();
    stroke.dashArray = [5, 3];
    stroke.dashOffset = 2;
    const result = strokeToSvgAttrs(stroke, defs);
    expect(result).toContain('stroke-dasharray="5 3"');
    expect(result).toContain('stroke-dashoffset="2"');
  });
});

// ============================================================================
// transformToSvgAttr
// ============================================================================

describe('transformToSvgAttr', () => {
  it('returns empty string for identity transform', () => {
    expect(transformToSvgAttr(makeTransform())).toBe('');
  });

  it('generates translate', () => {
    const result = transformToSvgAttr(makeTransform({ position: { x: 50, y: 100 } }));
    expect(result).toContain('translate(50,100)');
  });

  it('generates rotate', () => {
    const result = transformToSvgAttr(makeTransform({ rotation: 45 }));
    expect(result).toContain('rotate(45)');
  });

  it('generates scale', () => {
    const result = transformToSvgAttr(makeTransform({ scale: { x: 2, y: 3 } }));
    expect(result).toContain('scale(2,3)');
  });

  it('combines translate, rotate, scale', () => {
    const result = transformToSvgAttr(
      makeTransform({
        position: { x: 10, y: 20 },
        rotation: 90,
        scale: { x: 0.5, y: 0.5 },
      })
    );
    expect(result).toContain('translate(10,20)');
    expect(result).toContain('rotate(90)');
    expect(result).toContain('scale(0.5,0.5)');
  });
});

// ============================================================================
// nodeToSvgElement — Rectangle
// ============================================================================

describe('nodeToSvgElement', () => {
  it('converts RectangleNode to <rect>', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r1', 'rectangle'),
      type: 'rectangle',
      width: 200,
      height: 100,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill(makeColor(0, 128, 255))],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
    expect(svg).toContain('fill="#0080ff"');
  });

  it('converts RectangleNode with uniform corner radius to rx/ry', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r2', 'rectangle'),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [8, 8, 8, 8],
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('rx="8"');
    expect(svg).toContain('ry="8"');
  });

  it('converts RectangleNode with per-corner radius to <path>', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r3', 'rectangle'),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [10, 5, 0, 15],
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<path');
    expect(svg).toContain('d="');
  });

  // --------------------------------------------------------------------------
  // Ellipse
  // --------------------------------------------------------------------------

  it('converts EllipseNode to <ellipse>', () => {
    const node: EllipseNode = {
      ...makeBaseNodeFields('e1', 'ellipse'),
      type: 'ellipse',
      radiusX: 60,
      radiusY: 40,
      fills: [makeSolidFill(makeColor(0, 255, 0))],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('rx="60"');
    expect(svg).toContain('ry="40"');
  });

  // --------------------------------------------------------------------------
  // Polygon
  // --------------------------------------------------------------------------

  it('converts PolygonNode to <path>', () => {
    const node: PolygonNode = {
      ...makeBaseNodeFields('p1', 'polygon'),
      type: 'polygon',
      sides: 6,
      radius: 50,
      fills: [makeSolidFill(makeColor(128, 128, 0))],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<path');
    expect(svg).toContain('d="M');
    expect(svg).toContain('Z');
  });

  it('converts star PolygonNode to <path>', () => {
    const node: PolygonNode = {
      ...makeBaseNodeFields('s1', 'polygon'),
      type: 'polygon',
      sides: 5,
      radius: 50,
      innerRadius: 25,
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<path');
  });

  // --------------------------------------------------------------------------
  // Path
  // --------------------------------------------------------------------------

  it('converts PathNode to <path>', () => {
    const node: PathNode = {
      ...makeBaseNodeFields('path1', 'path'),
      type: 'path',
      points: [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 50, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
      closed: false,
      fills: [makeSolidFill()],
      strokes: [makeStroke()],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<path');
    expect(svg).toContain('d="M0,0L50,50"');
  });

  it('handles PathNode with subpaths', () => {
    const node: PathNode = {
      ...makeBaseNodeFields('path2', 'path'),
      type: 'path',
      points: [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 50, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
      subpaths: [
        [
          { position: { x: 20, y: 10 }, handleIn: null, handleOut: null, type: 'corner' },
          { position: { x: 40, y: 10 }, handleIn: null, handleOut: null, type: 'corner' },
          { position: { x: 30, y: 30 }, handleIn: null, handleOut: null, type: 'corner' },
        ],
      ],
      closed: true,
      fillRule: 'evenodd',
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('fill-rule="evenodd"');
    // Should have two M commands (one for primary, one for subpath)
    const dAttr = svg.match(/d="([^"]+)"/)?.[1];
    expect(dAttr).toBeDefined();
    const mCount = (dAttr!.match(/M/g) || []).length;
    expect(mCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Text
  // --------------------------------------------------------------------------

  it('converts TextNode to <text>', () => {
    const node: TextNode = {
      ...makeBaseNodeFields('t1', 'text'),
      type: 'text',
      content: 'Hello World',
      fontFamily: 'Arial',
      fontSize: 24,
      fontWeight: 700,
      fontStyle: 'normal',
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [makeSolidFill(makeColor(0, 0, 0))],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<text');
    expect(svg).toContain('font-family="Arial"');
    expect(svg).toContain('font-size="24"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('Hello World');
  });

  it('escapes XML special characters in text', () => {
    const node: TextNode = {
      ...makeBaseNodeFields('t2', 'text'),
      type: 'text',
      content: '<script>alert("xss")</script>',
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  // --------------------------------------------------------------------------
  // Image
  // --------------------------------------------------------------------------

  it('converts ImageNode to <image>', () => {
    const node: ImageNode = {
      ...makeBaseNodeFields('img1', 'image'),
      type: 'image',
      src: 'data:image/png;base64,AAAA',
      width: 200,
      height: 150,
      naturalWidth: 200,
      naturalHeight: 150,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
    } as unknown as ImageNode;
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('<image');
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="150"');
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
  });

  // --------------------------------------------------------------------------
  // Group
  // --------------------------------------------------------------------------

  it('converts GroupNode to <g> with children', () => {
    const child1: RectangleNode = {
      ...makeBaseNodeFields('c1', 'rectangle', { parent: 'g1' }),
      type: 'rectangle',
      width: 50,
      height: 30,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    const child2: EllipseNode = {
      ...makeBaseNodeFields('c2', 'ellipse', { parent: 'g1' }),
      type: 'ellipse',
      radiusX: 20,
      radiusY: 20,
      fills: [makeSolidFill(makeColor(0, 0, 255))],
      strokes: [],
    };
    const group: GroupNode = {
      ...makeBaseNodeFields('g1', 'group', { children: ['c1', 'c2'] }),
      type: 'group',
    };
    sceneGraph.addNode(group);
    sceneGraph.addNode(child1);
    sceneGraph.addNode(child2);

    const defs: string[] = [];
    const svg = nodeToSvgElement(group, sceneGraph, defs);
    expect(svg).toContain('<g');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('</g>');
  });

  // --------------------------------------------------------------------------
  // Opacity
  // --------------------------------------------------------------------------

  it('adds opacity attribute when opacity < 1', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r4', 'rectangle', { opacity: 0.5 }),
      type: 'rectangle',
      width: 100,
      height: 100,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    const svg = nodeToSvgElement(node, sceneGraph, defs);
    expect(svg).toContain('opacity="0.5"');
  });

  // --------------------------------------------------------------------------
  // Non-visual nodes
  // --------------------------------------------------------------------------

  it('returns empty string for bone nodes', () => {
    const node = {
      ...makeBaseNodeFields('b1', 'bone'),
      type: 'bone' as const,
      length: 50,
      boneStyle: 'stick' as const,
      boneColor: '#E0E0E0',
    };
    sceneGraph.addNode(node);
    const defs: string[] = [];
    expect(nodeToSvgElement(node, sceneGraph, defs)).toBe('');
  });
});

// ============================================================================
// exportNodesToSvg
// ============================================================================

describe('exportNodesToSvg', () => {
  it('produces valid SVG with viewBox', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r1', 'rectangle', {
        transform: makeTransform({ position: { x: 100, y: 50 } }),
      }),
      type: 'rectangle',
      width: 200,
      height: 100,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);

    const svg = exportNodesToSvg([node], sceneGraph);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0');
    expect(svg).toContain('</svg>');
  });

  it('returns minimal SVG for empty node list', () => {
    const svg = exportNodesToSvg([], sceneGraph);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('applies Y-flip transform', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r1', 'rectangle'),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);

    const svg = exportNodesToSvg([node], sceneGraph);
    expect(svg).toContain('scale(1,-1)');
  });

  it('includes gradient defs when present', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('r1', 'rectangle'),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [
        {
          type: 'gradient',
          gradient: {
            type: 'linear',
            stops: [
              { offset: 0, color: makeColor(255, 0, 0) },
              { offset: 1, color: makeColor(0, 255, 0) },
            ],
          },
          opacity: 1,
          visible: true,
        },
      ],
      strokes: [],
    };
    sceneGraph.addNode(node);

    const svg = exportNodesToSvg([node], sceneGraph);
    expect(svg).toContain('<defs>');
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('</defs>');
  });

  it('skips invisible nodes', () => {
    const visible: RectangleNode = {
      ...makeBaseNodeFields('v1', 'rectangle'),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    const hidden: RectangleNode = {
      ...makeBaseNodeFields('h1', 'rectangle', { visible: false }),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill(makeColor(0, 0, 255))],
      strokes: [],
    };
    sceneGraph.addNode(visible);
    sceneGraph.addNode(hidden);

    const svg = exportNodesToSvg([visible, hidden], sceneGraph);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).not.toContain('fill="#0000ff"');
  });

  it('exports multiple nodes', () => {
    const r: RectangleNode = {
      ...makeBaseNodeFields('r1', 'rectangle', {
        transform: makeTransform({ position: { x: 0, y: 0 } }),
      }),
      type: 'rectangle',
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    const e: EllipseNode = {
      ...makeBaseNodeFields('e1', 'ellipse', {
        transform: makeTransform({ position: { x: 150, y: 0 } }),
      }),
      type: 'ellipse',
      radiusX: 30,
      radiusY: 30,
      fills: [makeSolidFill(makeColor(0, 255, 0))],
      strokes: [],
    };
    sceneGraph.addNode(r);
    sceneGraph.addNode(e);

    const svg = exportNodesToSvg([r, e], sceneGraph);
    expect(svg).toContain('<rect');
    expect(svg).toContain('<ellipse');
  });
});
