import { describe, it, expect, beforeEach } from 'vitest';
import { importSvg } from '../svgImporter';
import { SceneGraph } from '../../SceneGraph';
import type { RectangleNode, EllipseNode, PathNode } from '@quar/types';

let idCounter = 0;
const generateId = () => `node_${++idCounter}`;

let sceneGraph: SceneGraph;

beforeEach(() => {
  idCounter = 0;
  sceneGraph = new SceneGraph();
});

describe('importSvg', () => {
  const simpleSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect x="50" y="50" width="100" height="100" fill="red" />
    </svg>
  `;

  it('imports an Illustrator SVG painted by classes (open strokes stay unfilled)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><style>.cls-1{fill:none;stroke:#231f20;stroke-width:2px;}.cls-2{fill:#ed1c24;}</style></defs>
      <path class="cls-1" d="M10 10 L50 50 L90 10"/>
      <rect class="cls-2" x="20" y="60" width="60" height="30"/>
    </svg>`;
    const result = importSvg(svg, sceneGraph, generateId);
    expect(result.nodes).toHaveLength(2);
    const line = result.nodes.find((n) => n.type === 'path') as PathNode;
    expect(line.closed).toBe(false);
    expect(line.fills).toHaveLength(0);
    expect(line.strokes[0]?.color).toMatchObject({ r: 0x23, g: 0x1f, b: 0x20 });
    expect(line.strokes[0]?.width).toBe(2);
    const box = result.nodes.find((n) => n.type === 'rectangle') as RectangleNode;
    expect(box.fills[0]?.color).toMatchObject({ r: 0xed, g: 0x1c, b: 0x24 });
  });

  it('imports a simple SVG into the scene graph', () => {
    const result = importSvg(simpleSvg, sceneGraph, generateId);
    expect(result.nodes).toHaveLength(1);
    expect(result.rootIds).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);

    // Verify it's actually in the scene graph
    const node = sceneGraph.getNode(result.rootIds[0]);
    expect(node).toBeTruthy();
    expect(node!.type).toBe('rectangle');
  });

  it('centers imported content at origin by default', () => {
    const result = importSvg(simpleSvg, sceneGraph, generateId);
    const node = sceneGraph.getNode(result.rootIds[0]) as RectangleNode;
    // With centerAtOrigin, the rect's center should be at (0, 0)
    expect(node.transform.position.x).toBeCloseTo(0);
    expect(node.transform.position.y).toBeCloseTo(0);
  });

  it('respects centerAtOrigin: false', () => {
    const result = importSvg(simpleSvg, sceneGraph, generateId, {
      centerAtOrigin: false,
    });
    const node = sceneGraph.getNode(result.rootIds[0]) as RectangleNode;
    // Without centering, position should be the Y-flipped SVG center
    expect(node.transform.position.x).toBeCloseTo(100);
    expect(node.transform.position.y).toBeCloseTo(100); // 200 - 100
  });

  it('imports to a specific position', () => {
    const result = importSvg(simpleSvg, sceneGraph, generateId, {
      position: { x: 500, y: 300 },
    });
    const node = sceneGraph.getNode(result.rootIds[0]) as RectangleNode;
    expect(node.transform.position.x).toBeCloseTo(500);
    expect(node.transform.position.y).toBeCloseTo(300);
  });

  it('applies scale factor', () => {
    const result = importSvg(simpleSvg, sceneGraph, generateId, {
      centerAtOrigin: false,
      scale: 2,
    });
    const node = sceneGraph.getNode(result.rootIds[0]) as RectangleNode;
    expect(node.width).toBe(200); // 100 * 2
    expect(node.height).toBe(200);
  });

  it('scales outlines and corner radii with the artwork', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="3 1"><path d="M2 2L22 22"/><rect x="2" y="2" width="20" height="20" rx="4"/></svg>';
    const result = importSvg(svg, sceneGraph, generateId, { scale: 2.5 });
    const path = result.nodes.find((n) => n.type === 'path') as PathNode;
    const rect = result.nodes.find((n) => n.type === 'rectangle') as RectangleNode;

    expect(path.strokes[0]!.width).toBe(5);
    expect(path.strokes[0]!.dashArray).toEqual([7.5, 2.5]);
    expect(rect.strokes[0]!.width).toBe(5);
    expect(rect.cornerRadius).toEqual([10, 10, 10, 10]);
  });

  it('scales about the point it imports to, not the origin', () => {
    const result = importSvg(simpleSvg, sceneGraph, generateId, {
      position: { x: 500, y: 300 },
      scale: 0.5,
    });
    const node = sceneGraph.getNode(result.rootIds[0]) as RectangleNode;
    expect(node.transform.position.x).toBeCloseTo(500);
    expect(node.transform.position.y).toBeCloseTo(300);
    expect(node.width).toBe(50);
  });

  it('scales the layout inside a group, not just its shapes', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <g>
          <rect x="0" y="0" width="50" height="50" />
          <rect x="100" y="0" width="50" height="50" />
        </g>
      </svg>
    `;
    const result = importSvg(svg, sceneGraph, generateId, { centerAtOrigin: false, scale: 2 });
    const group = sceneGraph.getNode(result.rootIds[0])!;
    const [a, b] = group.children.map((id) => sceneGraph.getNode(id) as RectangleNode);
    expect(a!.width).toBe(100);
    expect(b!.width).toBe(100);
    // The gap between them doubles with the shapes
    expect(Math.abs(b!.transform.position.x - a!.transform.position.x)).toBeCloseTo(200);
  });

  it('scales grouped artwork about the point it imports to', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <g transform="translate(10 10)">
          <rect x="0" y="0" width="50" height="50" />
          <rect x="100" y="0" width="50" height="50" />
        </g>
      </svg>
    `;
    const result = importSvg(svg, sceneGraph, generateId, {
      position: { x: 500, y: 300 },
      scale: 2,
    });
    const group = sceneGraph.getNode(result.rootIds[0])!;
    const [a, b] = group.children.map((id) => sceneGraph.getWorldPosition(id));
    // 50 either side of the middle in the SVG, 100 once scaled
    expect(a!.x).toBeCloseTo(400);
    expect(a!.y).toBeCloseTo(300);
    expect(b!.x).toBeCloseTo(600);
    expect(b!.y).toBeCloseTo(300);
  });

  it('imports multiple elements', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect width="50" height="50" fill="red" />
        <circle cx="100" cy="100" r="25" fill="blue" />
      </svg>
    `;
    const result = importSvg(svg, sceneGraph, generateId);
    expect(result.nodes).toHaveLength(2);
    expect(result.rootIds).toHaveLength(2);
    expect(sceneGraph.getNodeCount()).toBe(2);
  });

  it('imports groups with children into scene graph', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <g>
          <rect width="50" height="50" />
          <circle cx="100" cy="100" r="25" />
        </g>
      </svg>
    `;
    const result = importSvg(svg, sceneGraph, generateId);
    expect(result.rootIds).toHaveLength(1);
    // Group + 2 children
    expect(sceneGraph.getNodeCount()).toBe(3);

    const group = sceneGraph.getNode(result.rootIds[0])!;
    expect(group.type).toBe('group');
    expect(group.children).toHaveLength(2);
  });

  it('imports into a parent group', () => {
    // Create a parent group first
    const parentGroup = {
      id: 'parent_group',
      name: 'Parent',
      type: 'group' as const,
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
      blendMode: 'normal' as const,
    };
    sceneGraph.addNode(parentGroup);

    const result = importSvg(simpleSvg, sceneGraph, generateId, {
      parentId: 'parent_group',
    });

    const importedNode = sceneGraph.getNode(result.rootIds[0])!;
    expect(importedNode.parent).toBe('parent_group');
    expect(parentGroup.children).toContain(result.rootIds[0]);
  });

  describe('artwork in groups', () => {
    it('centers artwork wrapped in a group at the origin', () => {
      const result = importSvg(
        `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <g><rect x="50" y="50" width="100" height="100" /></g>
        </svg>
      `,
        sceneGraph,
        generateId
      );
      const group = sceneGraph.getNode(result.rootIds[0])!;
      const rect = sceneGraph.getNode(group.children[0]!)!;
      const center = sceneGraph.getWorldPosition(rect.id);
      expect(center.x).toBeCloseTo(0);
      expect(center.y).toBeCloseTo(0);
    });

    it('drops grouped artwork centered on the point asked for, group transform and all', () => {
      const result = importSvg(
        `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <g transform="translate(40 20)">
            <rect x="0" y="0" width="100" height="50" />
            <circle cx="150" cy="25" r="25" />
          </g>
        </svg>
      `,
        sceneGraph,
        generateId,
        { centerAtOrigin: false, position: { x: 500, y: 300 } }
      );
      // The artwork spans x 40–215 in the SVG, so its center is 127.5 across
      const group = sceneGraph.getNode(result.rootIds[0])!;
      const [rectId, circleId] = group.children;
      const rect = sceneGraph.getWorldPosition(rectId!);
      const circle = sceneGraph.getWorldPosition(circleId!);
      expect(rect.x).toBeCloseTo(500 - 37.5);
      expect(rect.y).toBeCloseTo(300);
      expect(circle.x).toBeCloseTo(500 + 62.5);
      expect(circle.y).toBeCloseTo(300);
    });
  });

  it('returns warnings for invalid SVG', () => {
    const result = importSvg('not xml <><>', sceneGraph, generateId);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.nodes).toHaveLength(0);
  });

  it('returns warnings for empty SVG', () => {
    const result = importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      sceneGraph,
      generateId
    );
    expect(result.warnings).toContain('SVG contains no visible elements');
  });

  it('generates unique IDs for each node', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect width="50" height="50" />
        <rect width="30" height="30" />
        <rect width="20" height="20" />
      </svg>
    `;
    const result = importSvg(svg, sceneGraph, generateId);
    const ids = result.nodes.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('importSvg — sheared shapes', () => {
  /** Each point of a path where the canvas draws it. */
  function drawnPoints(id: string): Array<[number, number]> {
    const node = sceneGraph.getNode(id) as PathNode;
    const m = sceneGraph.getWorldTransform(id);
    return node.points.map(({ position: p }) => [
      m.a * p.x + m.c * p.y + m.tx,
      m.b * p.x + m.d * p.y + m.ty,
    ]);
  }

  /** SVG-space points as the canvas shows them (Y up, a 100-high view box). */
  const flipped = (points: Array<[number, number]>) =>
    points.map(([x, y]) => [x, 100 - y] as [number, number]);

  function expectPoints(actual: Array<[number, number]>, expected: Array<[number, number]>) {
    expect(actual).toHaveLength(expected.length);
    actual.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i]![0], 3);
      expect(y).toBeCloseTo(expected[i]![1], 3);
    });
  }

  it('draws a skewed rectangle sheared, as the SVG does', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <rect x="0" y="0" width="100" height="50" transform="skewX(30)"/></svg>`;
    const { rootIds } = importSvg(svg, sceneGraph, generateId, { centerAtOrigin: false });
    const node = sceneGraph.getNode(rootIds[0]!)!;
    expect(node.type).toBe('path');
    expect(node.transform.skew).toEqual({ x: 0, y: 0 });
    const t = Math.tan(Math.PI / 6);
    const corners: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100 + 50 * t, 50],
      [50 * t, 50],
    ];
    // The same corners, in whichever order the outline starts
    const drawn = drawnPoints(node.id).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`);
    for (const [x, y] of flipped(corners))
      expect(drawn).toContain(`${x.toFixed(3)},${y.toFixed(3)}`);
  });

  it('keeps every point of a rotated, skewed and scaled path where the SVG puts it', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <path d="M10 10 L60 10 L40 40 Z" transform="translate(50 20) rotate(20) skewX(25) scale(1.5 0.8)"/></svg>`;
    const { rootIds } = importSvg(svg, sceneGraph, generateId, { centerAtOrigin: false });
    // The matrix, applied by hand to the SVG points
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const [cr, sr, tk] = [Math.cos(rad(20)), Math.sin(rad(20)), Math.tan(rad(25))];
    const apply = ([x, y]: [number, number]): [number, number] => {
      const [x1, y1] = [x * 1.5, y * 0.8]; // scale
      const x2 = x1 + tk * y1; // skewX
      return [50 + cr * x2 - sr * y1, 20 + sr * x2 + cr * y1]; // rotate, translate
    };
    expectPoints(
      drawnPoints(rootIds[0]!),
      flipped([apply([10, 10]), apply([60, 10]), apply([40, 40])])
    );
  });

  it('leaves a mirrored (unsheared) rectangle a rectangle', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <rect x="10" y="10" width="40" height="20" transform="scale(1 -1) translate(0 -60)"/></svg>`;
    const { rootIds } = importSvg(svg, sceneGraph, generateId, { centerAtOrigin: false });
    expect(sceneGraph.getNode(rootIds[0]!)!.type).toBe('rectangle');
  });
});
