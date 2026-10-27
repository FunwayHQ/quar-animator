import { describe, it, expect } from 'vitest';
import { convertSvgToNodes } from '../svgConverter';
import { parseSvg } from '../svgParser';
import type { RectangleNode, EllipseNode, PathNode, GroupNode, Gradient } from '@quar/types';

let idCounter = 0;
const generateId = () => `test_${++idCounter}`;

beforeEach(() => {
  idCounter = 0;
});

function convert(svgString: string) {
  const parsed = parseSvg(svgString);
  return convertSvgToNodes(parsed, generateId);
}

describe('convertSvgToNodes', () => {
  // --------------------------------------------------------------------------
  // Rectangle
  // --------------------------------------------------------------------------

  describe('rect → RectangleNode', () => {
    it('converts rect with correct dimensions', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect x="10" y="20" width="100" height="50" fill="red" />
        </svg>
      `);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as RectangleNode;
      expect(node.type).toBe('rectangle');
      expect(node.width).toBe(100);
      expect(node.height).toBe(50);
    });

    it('centers the transform at rect center (Y-flipped)', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect x="0" y="0" width="100" height="100" />
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      // SVG center: (50, 50), Y-flip with viewBoxHeight 200: y = 200 - 50 = 150
      expect(node.transform.position.x).toBeCloseTo(50);
      expect(node.transform.position.y).toBeCloseTo(150);
    });

    it('converts corner radius from rx/ry', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect width="100" height="50" rx="10" ry="10" />
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      expect(node.cornerRadius).toEqual([10, 10, 10, 10]);
    });

    it('converts fill color', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect width="100" height="50" fill="#ff0000" />
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      expect(node.fills).toHaveLength(1);
      expect(node.fills[0].type).toBe('solid');
      expect(node.fills[0].color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('converts stroke', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect width="100" height="50" fill="none" stroke="blue" stroke-width="2" />
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      expect(node.fills).toHaveLength(0);
      expect(node.strokes).toHaveLength(1);
      expect(node.strokes[0].width).toBe(2);
    });

    it('uses element id as name', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect id="myRect" width="100" height="50" />
        </svg>
      `);
      expect(nodes[0].name).toBe('myRect');
    });
  });

  // --------------------------------------------------------------------------
  // Ellipse / Circle
  // --------------------------------------------------------------------------

  describe('ellipse/circle → EllipseNode', () => {
    it('converts ellipse', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <ellipse cx="100" cy="50" rx="80" ry="30" fill="green" />
        </svg>
      `);
      const node = nodes[0] as EllipseNode;
      expect(node.type).toBe('ellipse');
      expect(node.radiusX).toBe(80);
      expect(node.radiusY).toBe(30);
    });

    it('converts circle to EllipseNode (equal radii)', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="50" fill="blue" />
        </svg>
      `);
      const node = nodes[0] as EllipseNode;
      expect(node.type).toBe('ellipse');
      expect(node.radiusX).toBe(50);
      expect(node.radiusY).toBe(50);
    });

    it('Y-flips ellipse center', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <circle cx="100" cy="50" r="10" />
        </svg>
      `);
      const node = nodes[0] as EllipseNode;
      expect(node.transform.position.y).toBeCloseTo(150); // 200 - 50
    });
  });

  // --------------------------------------------------------------------------
  // Path
  // --------------------------------------------------------------------------

  describe('path → PathNode', () => {
    it('converts simple path', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 10 20 L 30 40 L 50 20" stroke="black" fill="none" />
        </svg>
      `);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as PathNode;
      expect(node.type).toBe('path');
      expect(node.points).toHaveLength(3);
      expect(node.closed).toBe(false);
    });

    it('Y-flips path points and centers them', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 10 20 L 30 40" stroke="black" fill="none" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      // Raw Y-flip: (10, 80) and (30, 60) → center (20, 70)
      // Centered: (-10, 10) and (10, -10)
      expect(node.transform.position.x).toBeCloseTo(20);
      expect(node.transform.position.y).toBeCloseTo(70);
      expect(node.points[0].position.x).toBeCloseTo(-10);
      expect(node.points[0].position.y).toBeCloseTo(10);
      expect(node.points[1].position.x).toBeCloseTo(10);
      expect(node.points[1].position.y).toBeCloseTo(-10);
    });

    it('closed paths get fills', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 0 0 L 100 0 L 100 100 Z" fill="red" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      expect(node.closed).toBe(true);
      expect(node.fills).toHaveLength(1);
    });

    it('fills an open path as SVG does, closing it', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 0 0 L 100 0 L 100 100" fill="red" />
        </svg>
      `);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as PathNode;
      expect(node.closed).toBe(true);
      expect(node.points).toHaveLength(3);
      expect(node.fills).toHaveLength(1);
      expect(node.fills[0].color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('keeps the stroke of a filled open path open, over a closed fill', () => {
      const { nodes, rootIds } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path id="wave" d="M 0 0 L 100 0 L 100 100" fill="red" stroke="black" />
        </svg>
      `);
      expect(nodes).toHaveLength(2);
      // The fill is drawn first, under the stroke
      const [fill, stroke] = rootIds.map((id) => nodes.find((n) => n.id === id) as PathNode);
      expect(fill.name).toBe('wave Fill');
      expect(fill.closed).toBe(true);
      expect(fill.fills).toHaveLength(1);
      expect(fill.strokes).toHaveLength(0);
      expect(stroke.name).toBe('wave');
      expect(stroke.closed).toBe(false);
      expect(stroke.fills).toHaveLength(0);
      expect(stroke.strokes).toHaveLength(1);
      // Same outline in the same place, and not shared
      expect(fill.points).toEqual(stroke.points);
      expect(fill.points).not.toBe(stroke.points);
      expect(fill.transform).toEqual(stroke.transform);
      expect(fill.transform).not.toBe(stroke.transform);
    });

    it('fills an open curve, whose closing edge encloses area', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 0 50 C 0 0 100 0 100 50" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      expect(node.closed).toBe(true);
      expect(node.fills).toHaveLength(1);
    });

    it('leaves an open path unfilled when its fill is none, or would enclose nothing', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 0 0 L 100 0 L 100 100" fill="none" stroke="black" />
          <path d="M 0 0 L 50 50 L 100 100" stroke="black" />
          <path d="M 0 0 L 100 0 L 100 100" fill="transparent" stroke="black" />
        </svg>
      `);
      expect(nodes).toHaveLength(3);
      for (const node of nodes as PathNode[]) {
        expect(node.closed).toBe(false);
        expect(node.fills).toHaveLength(0);
        expect(node.strokes).toHaveLength(1);
      }
    });

    it('creates multiple PathNodes for multiple subpaths', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 0 0 L 10 10 M 50 50 L 60 60" stroke="black" fill="none" />
        </svg>
      `);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].type).toBe('path');
      expect(nodes[1].type).toBe('path');
    });
  });

  // --------------------------------------------------------------------------
  // Line / Polygon / Polyline
  // --------------------------------------------------------------------------

  describe('line → PathNode', () => {
    it('converts line to 2-point open path', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <line x1="10" y1="20" x2="80" y2="90" stroke="black" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      expect(node.type).toBe('path');
      expect(node.points).toHaveLength(2);
      expect(node.closed).toBe(false);
    });
  });

  describe('polygon → PathNode (closed)', () => {
    it('converts polygon to closed path', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <polygon points="50,0 100,100 0,100" fill="green" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      expect(node.type).toBe('path');
      expect(node.closed).toBe(true);
      expect(node.points).toHaveLength(3);
    });
  });

  describe('polyline → PathNode (open)', () => {
    it('converts polyline to open path', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <polyline points="0,0 50,50 100,0" stroke="red" fill="none" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      expect(node.type).toBe('path');
      expect(node.closed).toBe(false);
      expect(node.fills).toHaveLength(0);
    });

    it('fills a polyline as SVG does', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <polyline points="0,0 100,0 100,100" fill="green" />
          <polyline points="0,0 50,50 100,100" fill="green" stroke="red" />
        </svg>
      `);
      expect(nodes).toHaveLength(2);
      const filled = nodes[0] as PathNode;
      expect(filled.closed).toBe(true);
      expect(filled.fills).toHaveLength(1);
      // A straight polyline encloses nothing: just its stroke
      const straight = nodes[1] as PathNode;
      expect(straight.closed).toBe(false);
      expect(straight.fills).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Groups
  // --------------------------------------------------------------------------

  describe('g → GroupNode', () => {
    it('converts group with children', () => {
      const { nodes, rootIds } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <g id="myGroup">
            <rect width="50" height="50" />
            <circle cx="100" cy="100" r="25" />
          </g>
        </svg>
      `);
      expect(rootIds).toHaveLength(1);
      const group = nodes.find((n) => n.type === 'group') as GroupNode;
      expect(group).toBeTruthy();
      expect(group.name).toBe('myGroup');
      expect(group.children).toHaveLength(2);
    });

    it('wires parent references', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <g id="parent">
            <rect id="child" width="50" height="50" />
          </g>
        </svg>
      `);
      const group = nodes.find((n) => n.type === 'group')!;
      const rect = nodes.find((n) => n.type === 'rectangle')!;
      expect(rect.parent).toBe(group.id);
    });
  });

  // --------------------------------------------------------------------------
  // Gradients
  // --------------------------------------------------------------------------

  describe('gradient fills', () => {
    it('converts linear gradient fill', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="red" />
              <stop offset="1" stop-color="blue" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#lg)" />
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      expect(node.fills).toHaveLength(1);
      expect(node.fills[0].type).toBe('gradient');
      expect(node.fills[0].gradient).toBeTruthy();
      expect(node.fills[0].gradient!.type).toBe('linear');
      expect(node.fills[0].gradient!.stops).toHaveLength(2);
    });

    /**
     * Where a linear gradient's ramp is (0 at its start, 1 at its end) at a
     * point of the shape's normalized bounds, as the renderer works it out.
     */
    function rampAt(gradient: Gradient, q: { x: number; y: number }): number {
      const { start, end } = gradient as Required<Pick<Gradient, 'start' | 'end'>>;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      return ((q.x - start.x) * dx + (q.y - start.y) * dy) / (dx * dx + dy * dy);
    }
    const TOP_LEFT = { x: 0, y: 1 };
    const TOP_RIGHT = { x: 1, y: 1 };
    const BOTTOM_LEFT = { x: 0, y: 0 };
    const BOTTOM_RIGHT = { x: 1, y: 0 };

    function gradientOf(svg: string): Gradient {
      return (convert(svg).nodes[0] as RectangleNode).fills[0]!.gradient!;
    }

    it('places a user-space gradient (Figma exports) across the shape', () => {
      const gradient = gradientOf(`
        <svg width="999" height="241" viewBox="0 0 999 241" xmlns="http://www.w3.org/2000/svg">
          <rect width="999" height="241" rx="23" fill="url(#paint0)"/>
          <defs>
            <linearGradient id="paint0" x1="0" y1="120.5" x2="999" y2="120.5" gradientUnits="userSpaceOnUse">
              <stop stop-color="#058B8C"/>
              <stop offset="1" stop-color="#6899E8"/>
            </linearGradient>
          </defs>
        </svg>
      `);
      expect(rampAt(gradient, BOTTOM_LEFT)).toBeCloseTo(0);
      expect(rampAt(gradient, TOP_LEFT)).toBeCloseTo(0);
      expect(rampAt(gradient, { x: 0.5, y: 0.5 })).toBeCloseTo(0.5);
      expect(rampAt(gradient, TOP_RIGHT)).toBeCloseTo(1);
    });

    it('measures a user-space gradient from where the shape is', () => {
      // The ramp covers only the middle half of a rect drawn away from the origin
      const gradient = gradientOf(`
        <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <rect x="100" y="50" width="200" height="100" fill="url(#g)"/>
          <linearGradient id="g" x1="150" y1="0" x2="250" y2="0" gradientUnits="userSpaceOnUse">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `);
      expect(rampAt(gradient, { x: 0.25, y: 0.5 })).toBeCloseTo(0);
      expect(rampAt(gradient, { x: 0.75, y: 0.5 })).toBeCloseTo(1);
    });

    it('measures a user-space gradient on a path from the path', () => {
      const node = convert(`
        <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <path d="M100 100 H300 V200 H100 Z" fill="url(#g)"/>
          <linearGradient id="g" x1="100" y1="100" x2="100" y2="200" gradientUnits="userSpaceOnUse">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `).nodes[0] as PathNode;
      const gradient = node.fills[0]!.gradient!;
      // SVG y=100 is the top of the path
      expect(rampAt(gradient, TOP_RIGHT)).toBeCloseTo(0);
      expect(rampAt(gradient, BOTTOM_LEFT)).toBeCloseTo(1);
    });

    it('keeps a top-to-bottom bounding-box gradient top to bottom', () => {
      const gradient = gradientOf(`
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="50" fill="url(#g)"/>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `);
      expect(rampAt(gradient, TOP_LEFT)).toBeCloseTo(0);
      expect(rampAt(gradient, BOTTOM_RIGHT)).toBeCloseTo(1);
    });

    it('keeps a diagonal user-space gradient square to its direction on a wide shape', () => {
      // From the top-left corner to the bottom-right one of a 200×100 rect, the
      // top-right corner is 0.8 of the way along (not 0.5 as in its box)
      const gradient = gradientOf(`
        <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="100" fill="url(#g)"/>
          <linearGradient id="g" x1="0" y1="0" x2="200" y2="100" gradientUnits="userSpaceOnUse">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `);
      expect(rampAt(gradient, TOP_LEFT)).toBeCloseTo(0);
      expect(rampAt(gradient, BOTTOM_RIGHT)).toBeCloseTo(1);
      expect(rampAt(gradient, TOP_RIGHT)).toBeCloseTo(0.8);
    });

    it('applies the gradientTransform', () => {
      // A left-to-right ramp turned 90° runs top to bottom
      const gradient = gradientOf(`
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="url(#g)"/>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(90)">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `);
      expect(rampAt(gradient, TOP_RIGHT)).toBeCloseTo(0);
      expect(rampAt(gradient, BOTTOM_LEFT)).toBeCloseTo(1);
    });

    it('reads user-space percentages and missing ends against the viewport', () => {
      const gradient = gradientOf(`
        <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="100" fill="url(#g)"/>
          <linearGradient id="g" x1="50%" gradientUnits="userSpaceOnUse">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `);
      // From x=100 (50%) to the default x2 of 100%, the right edge
      expect(rampAt(gradient, { x: 0.5, y: 0.5 })).toBeCloseTo(0);
      expect(rampAt(gradient, TOP_RIGHT)).toBeCloseTo(1);
    });

    it('places a user-space radial gradient on the shape', () => {
      const node = convert(`
        <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <circle cx="200" cy="100" r="50" fill="url(#g)"/>
          <radialGradient id="g" cx="200" cy="75" r="50" gradientUnits="userSpaceOnUse">
            <stop stop-color="white"/><stop offset="1" stop-color="black"/>
          </radialGradient>
        </svg>
      `).nodes[0] as EllipseNode;
      const gradient = node.fills[0]!.gradient!;
      expect(gradient.center!.x).toBeCloseTo(0.5);
      expect(gradient.center!.y).toBeCloseTo(0.75); // above the middle
      expect(gradient.radius).toBeCloseTo(0.5);
    });

    it('keeps a radial focal point, Y up like the center', () => {
      const gradient = gradientOf(`
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="url(#g)"/>
          <radialGradient id="g" cx="0.5" cy="0.5" r="0.5" fx="0.25" fy="0.25">
            <stop stop-color="white"/><stop offset="1" stop-color="black"/>
          </radialGradient>
        </svg>
      `);
      expect(gradient.center).toEqual({ x: 0.5, y: 0.5 });
      expect(gradient.focal!.x).toBeCloseTo(0.25);
      expect(gradient.focal!.y).toBeCloseTo(0.75); // SVG's top-left quarter
    });

    it('places a user-space focal point on the shape, and inherits one through href', () => {
      const node = convert(`
        <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <circle cx="200" cy="200" r="100" fill="url(#child)"/>
          <radialGradient id="base" cx="200" cy="200" r="100" fx="250" fy="200" gradientUnits="userSpaceOnUse">
            <stop stop-color="white"/><stop offset="1" stop-color="black"/>
          </radialGradient>
          <radialGradient id="child" href="#base"/>
        </svg>
      `).nodes[0] as EllipseNode;
      const gradient = node.fills[0]!.gradient!;
      expect(gradient.focal!.x).toBeCloseTo(0.75);
      expect(gradient.focal!.y).toBeCloseTo(0.5);
    });

    it('leaves out a focal point that is the center', () => {
      const gradient = gradientOf(`
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="url(#g)"/>
          <radialGradient id="g" cx="0.4" fx="0.4">
            <stop stop-color="white"/><stop offset="1" stop-color="black"/>
          </radialGradient>
        </svg>
      `);
      expect(gradient.focal).toBeUndefined();
    });

    it('paints a gradient with no direction in its last color', () => {
      const gradient = gradientOf(`
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="url(#g)"/>
          <linearGradient id="g" x1="10" y1="10" x2="10" y2="10" gradientUnits="userSpaceOnUse">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `);
      expect(gradient.stops.map((stop) => stop.color)).toEqual([
        { r: 0, g: 0, b: 255, a: 1 },
        { r: 0, g: 0, b: 255, a: 1 },
      ]);
    });

    it('places a stroke gradient too', () => {
      const node = convert(`
        <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <rect x="100" y="100" width="200" height="100" stroke="url(#g)" stroke-width="4" fill="none"/>
          <linearGradient id="g" x1="100" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
            <stop stop-color="red"/><stop offset="1" stop-color="blue"/>
          </linearGradient>
        </svg>
      `).nodes[0] as RectangleNode;
      const gradient = node.strokes[0]!.gradient!;
      expect(rampAt(gradient, BOTTOM_LEFT)).toBeCloseTo(0);
      expect(rampAt(gradient, TOP_RIGHT)).toBeCloseTo(1);
    });
  });

  // --------------------------------------------------------------------------
  // Opacity
  // --------------------------------------------------------------------------

  describe('opacity', () => {
    it('converts element opacity', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect width="100" height="100" opacity="0.5" />
        </svg>
      `);
      expect(nodes[0].opacity).toBe(0.5);
    });

    it('converts fill-opacity', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect width="100" height="100" fill="red" fill-opacity="0.3" />
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      expect(node.fills[0].opacity).toBe(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // Multiple elements
  // --------------------------------------------------------------------------

  it('converts multiple root elements', () => {
    const { nodes, rootIds } = convert(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect width="50" height="50" />
        <circle cx="100" cy="100" r="25" />
        <path d="M 0 0 L 100 100" stroke="black" fill="none" />
      </svg>
    `);
    expect(rootIds).toHaveLength(3);
    expect(nodes).toHaveLength(3);
  });

  // --------------------------------------------------------------------------
  // Node structure
  // --------------------------------------------------------------------------

  it('all nodes have required fields', () => {
    const { nodes } = convert(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect width="50" height="50" />
      </svg>
    `);
    const node = nodes[0];
    expect(node.id).toBeTruthy();
    expect(node.name).toBeTruthy();
    expect(node.type).toBeTruthy();
    expect(node.transform).toBeTruthy();
    expect(node.transform.position).toBeTruthy();
    expect(node.transform.scale).toEqual({ x: 1, y: 1 });
    expect(node.transform.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(node.visible).toBe(true);
    expect(node.locked).toBe(false);
    expect(node.blendMode).toBe('normal');
  });

  describe('group transform (F043)', () => {
    it('applies a relative Y-delta to a group translate, not a viewBox flip', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <g transform="translate(30, 40)"><rect width="10" height="10"/></g>
        </svg>
      `);
      const group = nodes[0] as GroupNode;
      expect(group.type).toBe('group');
      expect(group.transform.position.x).toBeCloseTo(30);
      expect(group.transform.position.y).toBeCloseTo(-40); // NOT 160
    });

    it('negates a group rotation for the Y-flip convention', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <g transform="rotate(30)"><rect width="10" height="10"/></g>
        </svg>
      `);
      const group = nodes[0] as GroupNode;
      expect(group.transform.rotation).toBeCloseTo(-30);
    });
  });

  describe('shape transform through the full matrix (F044)', () => {
    it('rotates a circle center through the matrix', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <circle cx="50" cy="0" r="10" transform="rotate(90)"/>
        </svg>
      `);
      const node = nodes[0] as EllipseNode;
      // (50,0) rotated 90deg -> (0,50); Y-flip 200 -> (0,150).
      expect(node.transform.position.x).toBeCloseTo(0);
      expect(node.transform.position.y).toBeCloseTo(150);
    });

    it('scales a circle center through the matrix', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
          <circle cx="50" cy="50" r="10" transform="scale(2)"/>
        </svg>
      `);
      const node = nodes[0] as EllipseNode;
      // (50,50) scaled x2 -> (100,100); Y-flip 400 -> (100,300).
      expect(node.transform.position.x).toBeCloseTo(100);
      expect(node.transform.position.y).toBeCloseTo(300);
    });

    it('rotates a centered path through the matrix', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <path d="M 40 0 L 60 0" transform="rotate(90)" stroke="black" fill="none"/>
        </svg>
      `);
      const node = nodes[0] as PathNode;
      // Segment center (50,0) rotated 90deg -> (0,50); Y-flip -> (0,150).
      expect(node.transform.position.x).toBeCloseTo(0);
      expect(node.transform.position.y).toBeCloseTo(150);
    });

    it('leaves a pure-translate shape unchanged (regression)', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect x="0" y="0" width="100" height="100" transform="translate(10, 20)"/>
        </svg>
      `);
      const node = nodes[0] as RectangleNode;
      // center (50,50) + translate(10,20) = (60,70); Y-flip 200 -> (60,130).
      expect(node.transform.position.x).toBeCloseTo(60);
      expect(node.transform.position.y).toBeCloseTo(130);
    });
  });
});

describe('layer names from SVG ids', () => {
  const named = (id: string) =>
    convert(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect id="${id}" width="10" height="10"/></svg>`
    ).nodes[0]?.name;

  it('reads as it is: no characters that turn the text around or hide it', () => {
    // Right-to-left override: "Logo‮fdp.exe" shows as "Logoexe.pdf"
    expect(named('Logo‮fdp.exe')).toBe('Logofdp.exe');
    expect(named('Hero​‍banner﻿')).toBe('Herobanner');
    expect(named('Two&#9;words&#10;here')).toBe('Two words here');
  });

  it('is cut at 100 characters', () => {
    const name = named('x'.repeat(50_000));
    expect(name).toHaveLength(100);
    expect(named('ab '.repeat(40))).toBe('ab '.repeat(40).slice(0, 100));
  });

  it('is the shape’s kind when the id leaves nothing', () => {
    expect(named('‮​')).toBe('Rectangle');
  });
});
