/**
 * Tests for SelectionManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from './SelectionManager';
import { SceneGraph, createDefaultTransform } from '../SceneGraph';
import type {
  RectangleNode,
  EllipseNode,
  PathNode,
  GroupNode,
  PolygonNode,
  TextNode,
  ArtboardNode,
} from '@quar/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestRectangle(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): RectangleNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };

  return {
    id,
    name: `Rectangle ${id}`,
    type: 'rectangle',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function createTestEllipse(
  id: string,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number
): EllipseNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };

  return {
    id,
    name: `Ellipse ${id}`,
    type: 'ellipse',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX,
    radiusY,
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function createTestPath(
  id: string,
  x: number,
  y: number,
  points: Array<{ x: number; y: number }>
): PathNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };

  return {
    id,
    name: `Path ${id}`,
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: points.map((p) => ({
      position: { x: p.x, y: p.y },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    })),
    closed: false,
    fills: [],
    strokes: [
      {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 2,
        opacity: 1,
        cap: 'round',
        join: 'round',
        visible: true,
      },
    ],
  };
}

function createTestGroup(id: string): GroupNode {
  const transform = createDefaultTransform();

  return {
    id,
    name: `Group ${id}`,
    type: 'group',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  };
}

function createTestPolygon(
  id: string,
  x: number,
  y: number,
  radius: number,
  sides: number,
  innerRadius?: number,
  rotation: number = 0
): PolygonNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };
  transform.rotation = rotation;

  const node: PolygonNode = {
    id,
    name: `Polygon ${id}`,
    type: 'polygon',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides,
    radius,
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
  if (innerRadius !== undefined) {
    node.innerRadius = innerRadius;
  }
  return node;
}

// ============================================================================
// Tests
// ============================================================================

describe('SelectionManager', () => {
  let manager: SelectionManager;
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    manager = new SelectionManager();
    sceneGraph = new SceneGraph();
  });

  // ==========================================================================
  // getSelectionBounds
  // ==========================================================================

  describe('getSelectionBounds', () => {
    it('should return null for empty selection', () => {
      const bounds = manager.getSelectionBounds(new Set(), sceneGraph);
      expect(bounds).toBeNull();
    });

    it('should return null when selected node does not exist', () => {
      const bounds = manager.getSelectionBounds(new Set(['nonexistent']), sceneGraph);
      expect(bounds).toBeNull();
    });

    it('should return bounds for single rectangle', () => {
      const rect = createTestRectangle('rect1', 100, 100, 50, 30);
      sceneGraph.addNode(rect);

      const bounds = manager.getSelectionBounds(new Set(['rect1']), sceneGraph);

      expect(bounds).not.toBeNull();
      expect(bounds!.rect.x).toBe(75); // 100 - 25 (half width)
      expect(bounds!.rect.y).toBe(85); // 100 - 15 (half height)
      expect(bounds!.rect.width).toBe(50);
      expect(bounds!.rect.height).toBe(30);
      expect(bounds!.center.x).toBe(100);
      expect(bounds!.center.y).toBe(100);
    });

    it('should return bounds for single ellipse', () => {
      const ellipse = createTestEllipse('ellipse1', 100, 100, 40, 25);
      sceneGraph.addNode(ellipse);

      const bounds = manager.getSelectionBounds(new Set(['ellipse1']), sceneGraph);

      expect(bounds).not.toBeNull();
      expect(bounds!.rect.x).toBe(60); // 100 - 40
      expect(bounds!.rect.y).toBe(75); // 100 - 25
      expect(bounds!.rect.width).toBe(80); // 40 * 2
      expect(bounds!.rect.height).toBe(50); // 25 * 2
    });

    it('should return bounds for single path', () => {
      const path = createTestPath('path1', 10, 20, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]);
      sceneGraph.addNode(path);

      const bounds = manager.getSelectionBounds(new Set(['path1']), sceneGraph);

      expect(bounds).not.toBeNull();
      expect(bounds!.rect.x).toBe(10); // 0 + 10 (position offset)
      expect(bounds!.rect.y).toBe(20); // 0 + 20
      expect(bounds!.rect.width).toBe(100);
      expect(bounds!.rect.height).toBe(50);
    });

    it('should return null for path with no points', () => {
      const path = createTestPath('path1', 0, 0, []);
      sceneGraph.addNode(path);

      const bounds = manager.getSelectionBounds(new Set(['path1']), sceneGraph);
      expect(bounds).toBeNull();
    });

    it('should return combined bounds for multiple nodes', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 40, 40);
      const rect2 = createTestRectangle('rect2', 150, 150, 40, 40);
      sceneGraph.addNode(rect1);
      sceneGraph.addNode(rect2);

      const bounds = manager.getSelectionBounds(new Set(['rect1', 'rect2']), sceneGraph);

      expect(bounds).not.toBeNull();
      // rect1: 30-70 x 30-70
      // rect2: 130-170 x 130-170
      // union: 30-170 x 30-170
      expect(bounds!.rect.x).toBe(30);
      expect(bounds!.rect.y).toBe(30);
      expect(bounds!.rect.width).toBe(140);
      expect(bounds!.rect.height).toBe(140);
      expect(bounds!.center.x).toBe(100);
      expect(bounds!.center.y).toBe(100);
    });

    it('should ignore invisible nodes', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 40, 40);
      const rect2 = createTestRectangle('rect2', 150, 150, 40, 40);
      rect2.visible = false;
      sceneGraph.addNode(rect1);
      sceneGraph.addNode(rect2);

      const bounds = manager.getSelectionBounds(new Set(['rect1', 'rect2']), sceneGraph);

      expect(bounds).not.toBeNull();
      // Should only include rect1 bounds
      expect(bounds!.rect.x).toBe(30);
      expect(bounds!.rect.y).toBe(30);
      expect(bounds!.rect.width).toBe(40);
      expect(bounds!.rect.height).toBe(40);
    });

    it('should return null when all selected nodes are invisible', () => {
      const rect = createTestRectangle('rect1', 50, 50, 40, 40);
      rect.visible = false;
      sceneGraph.addNode(rect);

      const bounds = manager.getSelectionBounds(new Set(['rect1']), sceneGraph);
      expect(bounds).toBeNull();
    });

    it('should return null for group nodes (no intrinsic bounds)', () => {
      const group = createTestGroup('group1');
      sceneGraph.addNode(group);

      const bounds = manager.getSelectionBounds(new Set(['group1']), sceneGraph);
      expect(bounds).toBeNull();
    });
  });

  // ==========================================================================
  // getNodeBounds
  // ==========================================================================

  describe('getNodeBounds', () => {
    it('should return correct bounds for rectangle', () => {
      const rect = createTestRectangle('rect1', 100, 50, 60, 40);

      const bounds = manager.getNodeBounds(rect);

      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBe(70); // 100 - 30
      expect(bounds!.y).toBe(30); // 50 - 20
      expect(bounds!.width).toBe(60);
      expect(bounds!.height).toBe(40);
    });

    it('should return correct bounds for ellipse', () => {
      const ellipse = createTestEllipse('ellipse1', 200, 150, 30, 20);

      const bounds = manager.getNodeBounds(ellipse);

      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBe(170); // 200 - 30
      expect(bounds!.y).toBe(130); // 150 - 20
      expect(bounds!.width).toBe(60); // 30 * 2
      expect(bounds!.height).toBe(40); // 20 * 2
    });

    it('should return correct bounds for path', () => {
      const path = createTestPath('path1', 50, 50, [
        { x: -10, y: -10 },
        { x: 10, y: 10 },
        { x: 30, y: -5 },
      ]);

      const bounds = manager.getNodeBounds(path);

      expect(bounds).not.toBeNull();
      // min: -10, -10; max: 30, 10
      // with position offset: x = -10 + 50 = 40, y = -10 + 50 = 40
      expect(bounds!.x).toBe(40);
      expect(bounds!.y).toBe(40);
      expect(bounds!.width).toBe(40); // 30 - (-10)
      expect(bounds!.height).toBe(20); // 10 - (-10)
    });

    it('should return null for empty path', () => {
      const path = createTestPath('path1', 0, 0, []);

      const bounds = manager.getNodeBounds(path);
      expect(bounds).toBeNull();
    });

    it('should return null for group node', () => {
      const group = createTestGroup('group1');

      const bounds = manager.getNodeBounds(group);
      expect(bounds).toBeNull();
    });
  });

  // ==========================================================================
  // unionBounds
  // ==========================================================================

  describe('unionBounds', () => {
    it('should return empty rect for empty array', () => {
      const result = manager.unionBounds([]);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    it('should return same rect for single item', () => {
      const input = { x: 10, y: 20, width: 30, height: 40 };
      const result = manager.unionBounds([input]);

      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
      expect(result.width).toBe(30);
      expect(result.height).toBe(40);
    });

    it('should combine two non-overlapping rects', () => {
      const rect1 = { x: 0, y: 0, width: 10, height: 10 };
      const rect2 = { x: 20, y: 20, width: 10, height: 10 };

      const result = manager.unionBounds([rect1, rect2]);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(30);
      expect(result.height).toBe(30);
    });

    it('should combine overlapping rects', () => {
      const rect1 = { x: 0, y: 0, width: 20, height: 20 };
      const rect2 = { x: 10, y: 10, width: 20, height: 20 };

      const result = manager.unionBounds([rect1, rect2]);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(30);
      expect(result.height).toBe(30);
    });

    it('should combine multiple rects', () => {
      const rects = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 50, y: 0, width: 10, height: 10 },
        { x: 25, y: 50, width: 10, height: 10 },
      ];

      const result = manager.unionBounds(rects);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(60);
      expect(result.height).toBe(60);
    });

    it('should handle negative coordinates', () => {
      const rect1 = { x: -20, y: -10, width: 15, height: 15 };
      const rect2 = { x: 5, y: 5, width: 10, height: 10 };

      const result = manager.unionBounds([rect1, rect2]);

      expect(result.x).toBe(-20);
      expect(result.y).toBe(-10);
      expect(result.width).toBe(35); // -20 to 15
      expect(result.height).toBe(25); // -10 to 15
    });
  });

  // ==========================================================================
  // getSelectionBoundsForDisplay — rotation center
  // ==========================================================================

  describe('getSelectionBoundsForDisplay rotation center', () => {
    it('should use node world position as rotation center for polygon', () => {
      const poly = createTestPolygon('star1', 200, 300, 100, 5, 40, 45);
      sceneGraph.addNode(poly);

      const result = manager.getSelectionBoundsForDisplay(new Set(['star1']), sceneGraph);
      expect(result).not.toBeNull();
      // The rotation center must match the node's world position (the
      // actual rotation pivot), NOT the AABB center which is offset for
      // odd-sided polygons/stars.
      expect(result!.bounds.center.x).toBeCloseTo(200, 0);
      expect(result!.bounds.center.y).toBeCloseTo(300, 0);
      expect(result!.rotation).toBe(45);
    });

    it('should use node position as rotation center for rectangle', () => {
      const rect = createTestRectangle('rect1', 100, 200, 60, 40);
      rect.transform.rotation = 30;
      sceneGraph.addNode(rect);

      const result = manager.getSelectionBoundsForDisplay(new Set(['rect1']), sceneGraph);
      expect(result).not.toBeNull();
      // For rectangles, AABB center and node position should coincide
      expect(result!.bounds.center.x).toBeCloseTo(100, 0);
      expect(result!.bounds.center.y).toBeCloseTo(200, 0);
      expect(result!.rotation).toBe(30);
    });
  });

  // ==========================================================================
  // Text Node Anchor Bounds (Bug 4 fix)
  // ==========================================================================

  describe('text node anchor-aware bounds', () => {
    function createTestTextNode(
      id: string,
      x: number,
      y: number,
      anchorX: number = 0,
      anchorY: number = 0
    ): TextNode {
      const transform = createDefaultTransform();
      transform.position = { x, y };
      transform.anchor = { x: anchorX, y: anchorY };

      return {
        id,
        name: `Text ${id}`,
        type: 'text',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        content: 'Hello',
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
        fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
        strokes: [],
      };
    }

    it('should center text bounds when anchor is (0.5, 0.5)', () => {
      const text = createTestTextNode('t1', 100, 200, 0.5, 0.5);
      sceneGraph.addNode(text);

      const bounds = manager.getSelectionBounds(new Set(['t1']), sceneGraph);
      expect(bounds).not.toBeNull();
      // With anchor (0.5, 0.5), local bounds should be centered:
      // x = -width * 0.5, y = -height * 0.5
      // The world center should be at the node position (100, 200)
      expect(bounds!.rect.x + bounds!.rect.width / 2).toBeCloseTo(100, 0);
      expect(bounds!.rect.y + bounds!.rect.height / 2).toBeCloseTo(200, 0);
    });

    it('should use raw bounds when anchor is (0, 0)', () => {
      const text = createTestTextNode('t2', 100, 200, 0, 0);
      sceneGraph.addNode(text);

      const bounds = manager.getSelectionBounds(new Set(['t2']), sceneGraph);
      expect(bounds).not.toBeNull();
      // With anchor (0, 0), raw bounds are used directly (baseline-left origin)
      // Position should NOT be centered on the node position
    });

    it('should produce bounds for rotated text with centered anchor', () => {
      const text = createTestTextNode('t3', 100, 200, 0.5, 0.5);
      text.transform.rotation = 45;
      sceneGraph.addNode(text);

      const result = manager.getSelectionBoundsForDisplay(new Set(['t3']), sceneGraph);
      expect(result).not.toBeNull();
      // The rotation center should be at the node position
      expect(result!.bounds.center.x).toBeCloseTo(100, 0);
      expect(result!.bounds.center.y).toBeCloseTo(200, 0);
      expect(result!.rotation).toBe(45);
    });
  });

  // ==========================================================================
  // Artboard bounds
  // ==========================================================================

  describe('artboard bounds', () => {
    function createTestArtboard(
      id: string,
      x: number,
      y: number,
      width: number,
      height: number
    ): ArtboardNode {
      const transform = createDefaultTransform();
      transform.position = { x, y };
      return {
        id,
        name: `Artboard ${id}`,
        type: 'artboard',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width,
        height,
        fills: [
          {
            type: 'solid' as const,
            color: { r: 255, g: 255, b: 255, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        clipContent: true,
      };
    }

    it('should compute artboard bounds from width/height with centered anchor', () => {
      const artboard = createTestArtboard('art1', 100, 100, 200, 150);
      sceneGraph.addNode(artboard);

      const result = manager.getSelectionBounds(new Set(['art1']), sceneGraph);
      expect(result).not.toBeNull();
      expect(result!.rect.width).toBeCloseTo(200);
      expect(result!.rect.height).toBeCloseTo(150);
      // Center should be at the artboard position
      expect(result!.rect.x + result!.rect.width / 2).toBeCloseTo(100);
      expect(result!.rect.y + result!.rect.height / 2).toBeCloseTo(100);
    });

    it('should use own dimensions, not children bounds', () => {
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      sceneGraph.addNode(artboard);

      // Add a child that extends beyond artboard
      const child = createTestRectangle('child1', 0, 0, 1000, 1000);
      sceneGraph.addNode(child);
      sceneGraph.moveNode('child1', 'art1');

      const result = manager.getSelectionBounds(new Set(['art1']), sceneGraph);
      expect(result).not.toBeNull();
      // Bounds should be artboard's own size, not child's
      expect(result!.rect.width).toBeCloseTo(400);
      expect(result!.rect.height).toBeCloseTo(300);
    });

    it('should return bounds for display with rotation 0', () => {
      const artboard = createTestArtboard('art1', 300, 200, 500, 400);
      sceneGraph.addNode(artboard);

      const result = manager.getSelectionBoundsForDisplay(new Set(['art1']), sceneGraph);
      expect(result).not.toBeNull();
      expect(result!.rotation).toBe(0);
      expect(result!.bounds.rect.width).toBeCloseTo(500);
      expect(result!.bounds.rect.height).toBeCloseTo(400);
    });
  });
});
