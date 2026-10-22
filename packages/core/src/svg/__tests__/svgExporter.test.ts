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
  ArtboardNode,
  SymbolInstanceNode,
  SymbolDefinition,
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

  it("keeps Quar's upward gradient Y: shapes are drawn under the root's Y flip", () => {
    const defs: string[] = [];
    fillToSvgAttrs(
      {
        type: 'gradient',
        gradient: {
          type: 'linear',
          stops: [
            { offset: 0, color: makeColor(255, 0, 0) },
            { offset: 1, color: makeColor(0, 0, 255) },
          ],
          // Bottom to top
          start: { x: 0.5, y: 0 },
          end: { x: 0.5, y: 1 },
        },
        opacity: 1,
        visible: true,
      },
      defs
    );
    // Bottom to top on the page, as on the canvas
    expect(defs[0]).toContain('y1="0%"');
    expect(defs[0]).toContain('y2="100%"');
  });

  it('draws a linear gradient without ends at its angle, as the canvas does', () => {
    const defs: string[] = [];
    const gradient = (angle: number): Fill => ({
      type: 'gradient',
      gradient: {
        type: 'linear',
        angle,
        stops: [
          { offset: 0, color: makeColor(255, 0, 0) },
          { offset: 1, color: makeColor(0, 0, 255) },
        ],
      },
      opacity: 1,
      visible: true,
    });
    fillToSvgAttrs(gradient(90), defs);
    expect(defs[0]).toContain('x1="50%" y1="0%" x2="50%" y2="100%"');
    fillToSvgAttrs(gradient(0), defs);
    expect(defs[1]).toContain('x1="0%" y1="50%" x2="100%" y2="50%"');
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
    expect(defs[0]).toContain('cy="50%"');
  });

  it('writes a radial focal point as fx/fy, Y up like the shape', () => {
    const defs: string[] = [];
    fillToSvgAttrs(
      {
        type: 'gradient',
        gradient: {
          type: 'radial',
          stops: [
            { offset: 0, color: makeColor(255, 255, 255) },
            { offset: 1, color: makeColor(0, 0, 0) },
          ],
          center: { x: 0.5, y: 0.5 },
          radius: 0.5,
          focal: { x: 0.25, y: 0.75 },
        },
        opacity: 1,
        visible: true,
      },
      defs
    );
    expect(defs[0]).toContain('fx="25%"');
    expect(defs[0]).toContain('fy="75%"');
  });
});

// ============================================================================
// Effects and blend modes
// ============================================================================

describe('effects and blend modes', () => {
  const rect = (overrides: Record<string, unknown>): RectangleNode =>
    ({
      ...makeBaseNodeFields('r1', 'rectangle', overrides),
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    }) as RectangleNode;

  it('draws a drop shadow as the canvas does: blurred, offset, behind', () => {
    const defs: string[] = [];
    const svg = nodeToSvgElement(
      rect({
        effects: [
          {
            id: 'fx1',
            type: 'drop-shadow',
            visible: true,
            color: makeColor(0, 0, 0, 0.5),
            offsetX: 4,
            offsetY: -4,
            blur: 12,
            spread: 0,
            opacity: 0.5,
          },
        ],
      }),
      new SceneGraph(),
      defs
    );
    expect(svg).toMatch(/^<g filter="url\(#fx_\d+\)"><rect /);
    const filter = defs.find((d) => d.startsWith('<filter'));
    expect(filter).toContain('stdDeviation="4"');
    expect(filter).toContain('dx="4" dy="-4"');
    expect(filter).toContain('flood-opacity="0.25"');
    // The shadow first, the shape over it
    expect(filter).toMatch(/<feMergeNode in="s0"\/><feMergeNode in="SourceGraphic"\/>/);
  });

  it('blurs a layer and leaves out what the canvas does not draw', () => {
    const defs: string[] = [];
    const svg = nodeToSvgElement(
      rect({
        effects: [
          { id: 'b', type: 'layer-blur', visible: true, radius: 9 },
          {
            id: 'i',
            type: 'inner-shadow',
            visible: true,
            color: makeColor(0, 0, 0),
            offsetX: 2,
            offsetY: -2,
            blur: 4,
            spread: 0,
            opacity: 0.5,
          },
          { id: 'h', type: 'layer-blur', visible: false, radius: 30 },
        ],
      }),
      new SceneGraph(),
      defs
    );
    const filter = defs.find((d) => d.startsWith('<filter')) ?? '';
    expect(filter).toContain(
      '<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurred"/>'
    );
    expect(filter).not.toContain('SourceAlpha');
    expect(filter).toContain('<feMergeNode in="blurred"/>');
    expect(svg).toContain('filter=');
  });

  it('writes a blend mode, and nothing for plain normal layers', () => {
    const defs: string[] = [];
    expect(nodeToSvgElement(rect({ blendMode: 'multiply' }), new SceneGraph(), defs)).toMatch(
      /^<g style="mix-blend-mode:multiply"><rect /
    );
    expect(nodeToSvgElement(rect({}), new SceneGraph(), defs)).toMatch(/^<rect /);
    expect(defs).toHaveLength(0);
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

  it('exports every visible fill and stroke in paint order', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('paint-stack', 'rectangle'),
      type: 'rectangle',
      width: 40,
      height: 20,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill(makeColor(255, 0, 0)), makeSolidFill(makeColor(0, 0, 255), 0.5)],
      strokes: [makeStroke(makeColor(0, 255, 0), 2), makeStroke(makeColor(255, 255, 0), 4)],
    };
    sceneGraph.addNode(node);

    const svg = exportNodesToSvg([node], sceneGraph);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill="#0000ff"');
    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('stroke="#ffff00"');
    expect(svg.match(/<rect/g)).toHaveLength(4);
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

  it('sets each line of text as a tspan, wrapped in its box', () => {
    const node: TextNode = {
      ...makeBaseNodeFields('tw', 'text'),
      type: 'text',
      content: 'Hello world\nBye',
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      // Wide enough for one word a line (no font here: 12 per character)
      textResize: 'fixed',
      boxWidth: 70,
      boxHeight: 100,
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const svg = nodeToSvgElement(node, sceneGraph, []);

    const lines = [...svg.matchAll(/<tspan x="([^"]+)" y="([^"]+)">([^<]*)<\/tspan>/g)];
    expect(lines.map((m) => m[3])).toEqual(['Hello', 'world', 'Bye']);
    // A line height apart, starting from the same x
    const ys = lines.map((m) => Number(m[2]));
    expect(ys[1]! - ys[0]!).toBeCloseTo(24);
    expect(ys[2]! - ys[1]!).toBeCloseTo(24);
    expect(new Set(lines.map((m) => m[1])).size).toBe(1);
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

  it('appends a local counter-flip so exported text renders upright (F045)', () => {
    const node: TextNode = {
      ...makeBaseNodeFields('tf', 'text'),
      type: 'text',
      content: 'Hi',
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [makeSolidFill()],
      strokes: [],
    };
    sceneGraph.addNode(node);
    const svg = nodeToSvgElement(node, sceneGraph, []);
    // The <text> carries its own scale(1,-1), cancelling the root flip so glyphs
    // are upright (net y-axis positive).
    expect(svg).toContain('scale(1,-1)');
  });

  it('un-mirrors an exported image with a compensating translate (F045)', () => {
    const node: ImageNode = {
      ...makeBaseNodeFields('imgf', 'image'),
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
    const svg = nodeToSvgElement(node, sceneGraph, []);
    expect(svg).toContain('scale(1,-1)');
    expect(svg).toContain('translate(0,150)'); // height 150, anchor.y 0
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

  it('exports selected artboards using their dimensions and children', () => {
    const artboard: ArtboardNode = {
      ...makeBaseNodeFields('ab-export', 'artboard'),
      type: 'artboard',
      width: 320,
      height: 180,
      fills: [makeSolidFill(makeColor(20, 30, 40))],
      clipContent: true,
    };
    sceneGraph.addNode(artboard);

    const svg = exportNodesToSvg([artboard], sceneGraph);
    expect(svg).toContain('viewBox="0 0 320 180"');
    expect(svg).toContain('fill="#141e28"');
  });

  it('uses resolved symbol content to compute the selected instance bounds', () => {
    const symbolRect: RectangleNode = {
      ...makeBaseNodeFields('symbol-rect', 'rectangle', {
        transform: makeTransform({ position: { x: 10, y: 20 } }),
      }),
      type: 'rectangle',
      width: 40,
      height: 20,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [],
    };
    const definition: SymbolDefinition = {
      id: 'symbol-bounds-test',
      name: 'Bounded symbol',
      sceneGraphJSON: { nodes: [symbolRect], rootNodeIds: [symbolRect.id] },
    };
    const instance: SymbolInstanceNode = {
      ...makeBaseNodeFields('symbol-instance', 'symbol-instance', {
        transform: makeTransform({ position: { x: 100, y: 50 } }),
      }),
      type: 'symbol-instance',
      symbolId: definition.id,
      overrides: [],
    };
    sceneGraph.addNode(instance);

    const svg = exportNodesToSvg([instance], sceneGraph, [definition]);
    expect(svg).toContain('viewBox="0 0 40 20"');
    expect(svg).toContain('<rect');
  });

  it('includes stroke expansion in exported bounds', () => {
    const node: RectangleNode = {
      ...makeBaseNodeFields('stroked-bounds', 'rectangle'),
      type: 'rectangle',
      width: 20,
      height: 10,
      cornerRadius: [0, 0, 0, 0],
      fills: [makeSolidFill()],
      strokes: [makeStroke(makeColor(0, 0, 0), 8)],
    };
    sceneGraph.addNode(node);

    const svg = exportNodesToSvg([node], sceneGraph);
    const width = Number(svg.match(/viewBox="0 0 ([\d.]+)/)?.[1]);
    const height = Number(svg.match(/viewBox="0 0 [\d.]+ ([\d.]+)/)?.[1]);
    expect(width).toBeGreaterThan(20);
    expect(height).toBeGreaterThan(10);
  });

  it('computes cubic curve extrema instead of bounding only path anchors', () => {
    const path: PathNode = {
      ...makeBaseNodeFields('curve-bounds', 'path'),
      type: 'path',
      points: [
        {
          position: { x: 0, y: 0 },
          handleIn: null,
          handleOut: { x: 0, y: 100 },
          type: 'smooth',
        },
        {
          position: { x: 100, y: 0 },
          handleIn: { x: 0, y: 100 },
          handleOut: null,
          type: 'smooth',
        },
      ],
      closed: false,
      fills: [],
      strokes: [],
    };
    sceneGraph.addNode(path);

    const svg = exportNodesToSvg([path], sceneGraph);
    expect(svg).toContain('viewBox="0 0 100 75"');
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

describe('exportNodesToSvg: masks, boolean groups and clipping artboards', () => {
  const square = (id: string, x: number, size = 100): RectangleNode => ({
    ...makeBaseNodeFields(id, 'rectangle', {
      transform: makeTransform({ position: { x, y: 0 } }),
    }),
    type: 'rectangle',
    width: size,
    height: size,
    cornerRadius: [0, 0, 0, 0],
    fills: [makeSolidFill()],
    strokes: [],
  });
  const group = (id: string, extra: Partial<GroupNode>): GroupNode => ({
    ...makeBaseNodeFields(id, 'group'),
    type: 'group',
    ...extra,
  });

  it('draws a boolean group as the shape its operation makes, in its own paint', () => {
    const g = group('bool', {
      booleanOp: 'subtract',
      fills: [makeSolidFill(makeColor(0, 128, 255))],
    });
    sceneGraph.addNode(g);
    sceneGraph.addNode(square('a', 0, 100), 'bool');
    // Inside it (squares sit on their bottom-left corner here)
    sceneGraph.addNode(
      { ...square('b', 30, 40), transform: makeTransform({ position: { x: 30, y: 30 } }) },
      'bool'
    );

    const svg = exportNodesToSvg([g], sceneGraph);
    // One path, a square with a square hole: two rings
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg.match(/Z/g)).toHaveLength(2);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('fill="#0080ff"');
    expect(svg).not.toContain('<rect');
  });

  it('clips a mask group by its mask shape, which it doesn’t draw', () => {
    const g = group('masked', { maskNodeId: 'mask', maskMode: 'clip' });
    sceneGraph.addNode(g);
    sceneGraph.addNode(square('mask', 0, 50), 'masked');
    sceneGraph.addNode(square('art', 20, 100), 'masked');

    const svg = exportNodesToSvg([g], sceneGraph);
    expect(svg).toMatch(/<clipPath id="(mask_\d+)"><rect[^>]*\/><\/clipPath>/);
    expect(svg).toMatch(/<g clip-path="url\(#mask_\d+\)"><rect/);
    // The mask shape is in the clip only
    expect(svg.match(/<rect /g)).toHaveLength(2);
  });

  it('masks by alpha or luminance with an SVG mask', () => {
    for (const mode of ['alpha', 'luminance'] as const) {
      const fresh = new SceneGraph();
      const g = group('masked', { maskNodeId: 'mask', maskMode: mode });
      fresh.addNode(g);
      fresh.addNode(square('mask', 0, 50), 'masked');
      fresh.addNode(square('art', 20, 100), 'masked');
      const svg = exportNodesToSvg([g], fresh);
      expect(svg).toContain(`mask-type="${mode}"`);
      expect(svg).toMatch(/<g mask="url\(#mask_\d+\)">/);
    }
  });

  it('clips an artboard’s contents to it', () => {
    const artboard: ArtboardNode = {
      ...makeBaseNodeFields('board', 'artboard'),
      type: 'artboard',
      width: 200,
      height: 100,
      fills: [],
      clipContent: true,
    };
    sceneGraph.addNode(artboard);
    sceneGraph.addNode(square('spill', 150, 100), 'board');
    const svg = exportNodesToSvg([artboard], sceneGraph);
    expect(svg).toMatch(
      /<clipPath id="artboard_\d+"><rect x="-?0" y="-?0" width="200" height="100"\/>/
    );
    expect(svg).toMatch(/<g clip-path="url\(#artboard_\d+\)">/);
    // Framed by the artboard, not by what spills out of it
    expect(svg).toContain('viewBox="0 0 200 100"');
  });
});
