import { describe, it, expect } from 'vitest';
import { convertSvgToNodes } from '../svgConverter';
import { parseSvg } from '../svgParser';
import type { RectangleNode, EllipseNode, PathNode, GroupNode } from '@quar/types';

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

    it('open paths have no fills', () => {
      const { nodes } = convert(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M 0 0 L 100 0 L 100 100" fill="red" stroke="black" />
        </svg>
      `);
      const node = nodes[0] as PathNode;
      expect(node.closed).toBe(false);
      expect(node.fills).toHaveLength(0);
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
});
