import { describe, it, expect, beforeEach } from 'vitest';
import { importSvg } from '../svgImporter';
import { SceneGraph } from '../../SceneGraph';
import type { RectangleNode, EllipseNode } from '@quar/types';

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
    const ids = result.nodes.map(n => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
