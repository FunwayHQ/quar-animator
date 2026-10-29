/**
 * Tests for EraserTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EraserTool } from './EraserTool';
import type { ToolContext } from './BaseTool';
import type {
  PathNode,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  ImageNode,
  TextNode,
  GroupNode,
} from '@quar/types';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import { nodeToPolygon } from '../boolean/booleanOps';
import { mat3 } from '../math';

describe('EraserTool', () => {
  let context: ToolContext;
  let tool: EraserTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new EraserTool(context);
  });

  // Helper to create a test rectangle node
  function createTestRectangle(x: number, y: number, width: number, height: number): RectangleNode {
    const transform = createDefaultTransform();
    transform.position = { x, y };
    return {
      id: context.generateId(),
      name: 'Test Rectangle',
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
      fills: [context.defaultFill],
      strokes: [context.defaultStroke],
    };
  }

  // Helper to create a test ellipse node
  function createTestEllipse(x: number, y: number, radiusX: number, radiusY: number): EllipseNode {
    const transform = createDefaultTransform();
    transform.position = { x, y };
    return {
      id: context.generateId(),
      name: 'Test Ellipse',
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
      fills: [context.defaultFill],
      strokes: [context.defaultStroke],
    };
  }

  // Helper to create a test path node
  function createTestPath(
    x: number,
    y: number,
    points: { x: number; y: number }[],
    closed = false
  ): PathNode {
    const transform = createDefaultTransform();
    transform.position = { x, y };
    return {
      id: context.generateId(),
      name: 'Test Path',
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
      closed,
      fills: closed ? [context.defaultFill] : [],
      strokes: [context.defaultStroke],
    };
  }

  // Helper to create a closed rectangle-like path (for boolean subtraction tests)
  function createClosedRectPath(x: number, y: number, w: number, h: number): PathNode {
    const hw = w / 2;
    const hh = h / 2;
    return createTestPath(
      x,
      y,
      [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ],
      true
    );
  }

  // Helper to simulate a full stroke erase gesture (down → moves → up)
  function performStrokeErase(
    startPos: { x: number; y: number },
    endPos: { x: number; y: number }
  ) {
    tool.onPointerDown(createMockPointerEvent({ worldPosition: { ...startPos }, button: 0 }));
    tool.onPointerMove(createMockPointerEvent({ worldPosition: { ...endPos } }));
    tool.onPointerUp(createMockPointerEvent({ worldPosition: { ...endPos }, button: 0 }));
  }

  // Helper to simulate a single-click erase (down → up at same point)
  function performClickErase(pos: { x: number; y: number }) {
    tool.onPointerDown(createMockPointerEvent({ worldPosition: { ...pos }, button: 0 }));
    tool.onPointerUp(createMockPointerEvent({ worldPosition: { ...pos }, button: 0 }));
  }

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('eraser');
    });

    it('should have crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  // ==========================================================================
  // Options
  // ==========================================================================

  describe('options', () => {
    it('should have default options', () => {
      const options = tool.getOptions();
      expect(options.size).toBe(10);
      expect(options.mode).toBe('stroke');
    });

    it('should set options', () => {
      tool.setOptions({ size: 20, mode: 'point' });
      const options = tool.getOptions();
      expect(options.size).toBe(20);
      expect(options.mode).toBe('point');
    });

    it('should set eraser size', () => {
      tool.setSize(30);
      expect(tool.getOptions().size).toBe(30);
    });

    it('should clamp eraser size to minimum of 1', () => {
      tool.setSize(0);
      expect(tool.getOptions().size).toBe(1);
      tool.setSize(-10);
      expect(tool.getOptions().size).toBe(1);
    });

    it('should clamp eraser size to maximum of 100', () => {
      tool.setSize(150);
      expect(tool.getOptions().size).toBe(100);
    });

    it('should set eraser mode to stroke', () => {
      tool.setMode('point');
      tool.setMode('stroke');
      expect(tool.getOptions().mode).toBe('stroke');
    });

    it('should set eraser mode to point', () => {
      tool.setMode('point');
      expect(tool.getOptions().mode).toBe('point');
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should decrease size with [ key', () => {
      tool.setSize(20);
      tool.onKeyDown({ key: '[' } as KeyboardEvent);
      expect(tool.getOptions().size).toBe(15);
    });

    it('should increase size with ] key', () => {
      tool.setSize(20);
      tool.onKeyDown({ key: ']' } as KeyboardEvent);
      expect(tool.getOptions().size).toBe(25);
    });

    it('should not go below minimum size with [ key', () => {
      tool.setSize(3);
      tool.onKeyDown({ key: '[' } as KeyboardEvent);
      expect(tool.getOptions().size).toBe(1);
    });

    it('should not go above maximum size with ] key', () => {
      tool.setSize(98);
      tool.onKeyDown({ key: ']' } as KeyboardEvent);
      expect(tool.getOptions().size).toBe(100);
    });
  });

  // ==========================================================================
  // Stroke Eraser Mode (Boolean Subtraction)
  // ==========================================================================

  describe('stroke eraser mode (boolean subtraction)', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('cuts a rectangle it passes through in two: the rectangle, now a path, and a copy', () => {
      // Large rectangle at origin
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase through the center of the rectangle
      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // One half is still the rectangle's layer; the other half a copy above it
      expect(context.sceneGraph.getNodeCount()).toBe(2);
      const [kept, copy] = context.sceneGraph.getRootNodes();
      expect(kept!.id).toBe(rect.id);
      expect(kept!.type).toBe('path');
      expect(copy!.type).toBe('path');
      expect(copy!.name).toBe('Test Rectangle 2');
    });

    it('should fully remove a small shape when eraser covers it entirely', () => {
      // Small rectangle that the eraser can fully cover
      const rect = createTestRectangle(0, 0, 5, 5);
      context.sceneGraph.addNode(rect);
      tool.setSize(50); // Large eraser

      performClickErase({ x: 0, y: 0 });

      // Should be fully erased
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should not affect shapes that are far from the eraser', () => {
      const rect = createTestRectangle(500, 500, 50, 50);
      context.sceneGraph.addNode(rect);

      performStrokeErase({ x: 0, y: 0 }, { x: 10, y: 10 });

      // Shape should remain unchanged
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode(rect.id)).toBeDefined();
    });

    it('should subtract from ellipse', () => {
      const ellipse = createTestEllipse(0, 0, 100, 100);
      context.sceneGraph.addNode(ellipse);

      // Erase through the center
      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // Cut in two: the ellipse's layer, now a path, and a copy
      expect(context.sceneGraph.getNodeCount()).toBe(2);
      expect(context.sceneGraph.getNode(ellipse.id)!.type).toBe('path');
    });

    it('should subtract from multiple shapes', () => {
      const rect1 = createTestRectangle(-100, 0, 80, 80);
      const rect2 = createTestRectangle(100, 0, 80, 80);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      tool.setSize(30);

      // Erase line that cuts through both rectangles
      performStrokeErase({ x: -150, y: 0 }, { x: 150, y: 0 });

      // Both cut in two, each still its own layer with a copy for its other half
      const roots = context.sceneGraph.getRootNodes();
      expect(roots.length).toBe(4);
      for (const n of roots) expect(n.type).toBe('path');
      expect(roots[0]!.id).toBe(rect1.id);
      expect(roots[2]!.id).toBe(rect2.id);
    });

    it('should preserve fills and strokes from original node', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      const originalFills = [...rect.fills];
      const originalStrokes = [...rect.strokes];
      context.sceneGraph.addNode(rect);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      const resultNode = context.sceneGraph.getRootNodes()[0]! as PathNode;
      expect(resultNode.type).toBe('path');
      expect(resultNode.fills).toEqual(originalFills);
      expect(resultNode.strokes).toEqual(originalStrokes);
    });

    it('should preserve opacity and blendMode from original node', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      rect.opacity = 0.5;
      rect.blendMode = 'multiply';
      context.sceneGraph.addNode(rect);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.opacity).toBe(0.5);
      expect(resultNode.blendMode).toBe('multiply');
    });

    it('should preserve node name', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      rect.name = 'My Special Rectangle';
      context.sceneGraph.addNode(rect);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.name).toBe('My Special Rectangle');
    });

    it('should skip open paths', () => {
      // Open path — should not be affected
      const path = createTestPath(
        0,
        0,
        [
          { x: -50, y: 0 },
          { x: 50, y: 0 },
        ],
        false
      );
      context.sceneGraph.addNode(path);
      tool.setSize(30);

      performStrokeErase({ x: 0, y: -50 }, { x: 0, y: 50 });

      // Open path should remain unchanged
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode(path.id)).toBeDefined();
    });

    it('should subtract from closed paths', () => {
      const path = createClosedRectPath(0, 0, 200, 200);
      context.sceneGraph.addNode(path);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // Cut in two: the path and a copy of it
      expect(context.sceneGraph.getNodeCount()).toBe(2);
      expect(context.sceneGraph.getRootNodes()[0]!.id).toBe(path.id);
    });

    it('should skip locked nodes', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      rect.locked = true;
      context.sceneGraph.addNode(rect);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // Locked node should remain unchanged
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode(rect.id)).toBeDefined();
    });

    it('should skip text nodes', () => {
      const transform = createDefaultTransform();
      transform.position = { x: 0, y: 0 };
      const textNode: TextNode = {
        id: context.generateId(),
        name: 'Test Text',
        type: 'text',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        content: 'Hello World',
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
        fills: [context.defaultFill],
        strokes: [],
      };
      context.sceneGraph.addNode(textNode);
      tool.setSize(50);

      performClickErase({ x: 0, y: 0 });

      // Text should remain unchanged
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode(textNode.id)).toBeDefined();
    });

    it('should skip image nodes', () => {
      const transform = createDefaultTransform();
      transform.position = { x: 0, y: 0 };
      const imageNode: ImageNode = {
        id: context.generateId(),
        name: 'Test Image',
        type: 'image',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        src: 'data:image/png;base64,AAAA',
        width: 80,
        height: 60,
        naturalWidth: 80,
        naturalHeight: 60,
        cornerRadius: [0, 0, 0, 0],
      };
      context.sceneGraph.addNode(imageNode);
      tool.setSize(50);

      performClickErase({ x: 0, y: 0 });

      // Image should remain unchanged
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode(imageNode.id)).toBeDefined();
    });

    it('should subtract from polygon node', () => {
      const transform = createDefaultTransform();
      transform.position = { x: 0, y: 0 };
      const polygon: PolygonNode = {
        id: context.generateId(),
        name: 'Test Polygon',
        type: 'polygon',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        radius: 100,
        sides: 6,
        fills: [context.defaultFill],
        strokes: [context.defaultStroke],
      };
      context.sceneGraph.addNode(polygon);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // Cut in two: the polygon's layer, now a path, and a copy
      expect(context.sceneGraph.getNodeCount()).toBe(2);
      expect(context.sceneGraph.getNode(polygon.id)!.type).toBe('path');
    });

    it('should handle single-click (circle subtraction)', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);
      tool.setSize(30);

      performClickErase({ x: 0, y: 0 });

      // Should subtract a circle-shaped area
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.type).toBe('path');
    });

    it('keeps a cut shape in its place in the stack when a shape below it is erased', () => {
      // Bottom to top: a tiny shape the stroke covers, one it cuts, one it misses
      const tiny = createTestRectangle(-300, 0, 5, 5);
      const cut = createTestRectangle(0, 0, 100, 100);
      const missed = createTestRectangle(400, 0, 100, 100);
      context.sceneGraph.addNode(tiny);
      context.sceneGraph.addNode(cut);
      context.sceneGraph.addNode(missed);

      performStrokeErase({ x: -350, y: 0 }, { x: 0, y: 0 });

      const roots = context.sceneGraph.getRootNodes();
      expect(roots.map((node) => node.id)).not.toContain(tiny.id);
      expect(roots).toHaveLength(2);
      expect(roots[0]!.type).toBe('path'); // the cut shape, still below
      expect(roots[0]!.id).toBe(cut.id);
      expect(roots[1]!.id).toBe(missed.id);
    });
  });

  // ==========================================================================
  // What a cut layer keeps
  // ==========================================================================

  describe('a cut layer stays itself', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(10);
    });

    /** Where a layer's outline is drawn: its world-space box. */
    function worldBox(id: string) {
      const node = context.sceneGraph.getNode(id)!;
      const rings = nodeToPolygon(node, context.sceneGraph.getWorldTransform(id))!.flat();
      const xs = rings.flatMap((ring) => ring.map(([x]) => x));
      const ys = rings.flatMap((ring) => ring.map(([, y]) => y));
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }

    it('keeps its id, name, transform, look and effects, its outline where it was', () => {
      const rect = createTestRectangle(50, 20, 200, 100);
      rect.name = 'Card';
      rect.opacity = 0.6;
      rect.blendMode = 'multiply';
      rect.transform.rotation = 30;
      rect.transform.scale = { x: 1.5, y: 0.5 };
      rect.effects = [{ id: 'blur', type: 'layer-blur', visible: true, radius: 4 }];
      rect.exports = [{ format: 'png', multiplier: 2 }];
      context.sceneGraph.addNode(rect);
      const before = worldBox(rect.id);
      const onErase = vi.fn();
      context.onErase = onErase;

      // A hole in its middle
      performClickErase({ x: 50, y: 20 });

      const result = context.sceneGraph.getNode<PathNode>(rect.id)!;
      expect(result.type).toBe('path');
      expect(result.subpaths).toHaveLength(1);
      expect(result.name).toBe('Card');
      expect(result.opacity).toBe(0.6);
      expect(result.blendMode).toBe('multiply');
      expect(result.transform).toEqual(rect.transform);
      expect(result.effects).toEqual(rect.effects);
      expect(result.exports).toEqual(rect.exports);
      expect(result.fills).toEqual(rect.fills);
      expect(result.strokes).toEqual(rect.strokes);
      expect('width' in result).toBe(false);
      const after = worldBox(rect.id);
      after.forEach((value, i) => expect(value).toBeCloseTo(before[i]!, 3));
      expect(onErase).toHaveBeenCalledWith([{ id: rect.id, copies: [] }]);
    });

    it('cut in two: the larger piece keeps the layer, the other is a copy of it', () => {
      const path = createClosedRectPath(0, 0, 300, 100);
      path.name = 'Bar';
      path.effects = [{ id: 'blur', type: 'layer-blur', visible: true, radius: 2 }];
      path.strokeProgress = 0.5;
      context.sceneGraph.addNode(path);
      const onErase = vi.fn();
      context.onErase = onErase;

      // Across it, a third of the way along: the right piece is the larger
      performStrokeErase({ x: -50, y: -100 }, { x: -50, y: 100 });

      const [kept, copy] = context.sceneGraph.getRootNodes() as PathNode[];
      expect(kept!.id).toBe(path.id);
      expect(Math.min(...kept!.points.map((p) => p.position.x))).toBeGreaterThan(-50);
      expect(Math.max(...copy!.points.map((p) => p.position.x))).toBeLessThan(-50);
      expect(copy!.name).toBe('Bar 2');
      expect(copy!.effects).toEqual(path.effects);
      expect(copy!.strokeProgress).toBe(0.5);
      expect(copy!.transform).toEqual(path.transform);
      expect(onErase).toHaveBeenCalledWith([{ id: path.id, copies: [copy!.id] }]);
    });

    it("leaves a layer of several separate parts one layer when they're cut", () => {
      // Two squares side by side in one path
      const path = createClosedRectPath(-100, 0, 80, 80);
      path.subpaths = [
        [
          { x: 160, y: -40 },
          { x: 240, y: -40 },
          { x: 240, y: 40 },
          { x: 160, y: 40 },
        ].map((p) => ({ position: p, handleIn: null, handleOut: null, type: 'corner' as const })),
      ];
      context.sceneGraph.addNode(path);

      performStrokeErase({ x: -100, y: -100 }, { x: -100, y: 100 });

      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode<PathNode>(path.id)!.subpaths).toHaveLength(2);
    });

    it("keeps a brush stroke's Width and Profile, and what was erased in its own space", () => {
      const stroke = createClosedRectPath(100, 0, 200, 40);
      stroke.brushData = {
        spine: [
          { position: { x: -100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
          { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
        ],
        widths: [40, 40],
        profileId: 'taper',
        baseWidth: 40,
      };
      context.sceneGraph.addNode(stroke);

      // A bite out of its top edge, at x = 100 in the world (0 in its own space)
      performClickErase({ x: 100, y: 20 });

      const result = context.sceneGraph.getNode<PathNode>(stroke.id)!;
      expect(result.brushData!.profileId).toBe('taper');
      expect(result.brushData!.baseWidth).toBe(40);
      expect(result.brushData!.spine).toEqual(stroke.brushData.spine);
      const [taken] = result.brushData!.erased!;
      const xs = taken!.flat().map((p) => p.x);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 0);
    });
  });

  // ==========================================================================
  // Selection Updates
  // ==========================================================================

  describe('selection updates', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('keeps a cut layer selected, with the piece cut off it', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds([rect.id]);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      const [kept, copy] = context.sceneGraph.getRootNodes();
      expect([...context.getSelectedIds()]).toEqual([kept!.id, copy!.id]);
      expect(kept!.id).toBe(rect.id);
    });

    it('should clear selection for fully erased nodes', () => {
      const rect = createTestRectangle(0, 0, 5, 5);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds([rect.id]);
      tool.setSize(50);

      performClickErase({ x: 0, y: 0 });

      expect(context.getSelectedIds().size).toBe(0);
    });
  });

  // ==========================================================================
  // Grouped Nodes
  // ==========================================================================

  describe('grouped nodes', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should place replacement node in the same parent group', () => {
      // Create a group with a rectangle child
      const transform = createDefaultTransform();
      const group: GroupNode = {
        id: context.generateId(),
        name: 'Test Group',
        type: 'group',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
      };
      context.sceneGraph.addNode(group);

      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect, group.id);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // The group holds both halves: the rectangle's layer and its copy
      const updatedGroup = context.sceneGraph.getNode(group.id)!;
      expect(updatedGroup.children).toHaveLength(2);
      expect(updatedGroup.children[0]).toBe(rect.id);
      for (const child of context.sceneGraph.getChildren(group.id)) {
        expect(child.type).toBe('path');
        expect(child.parent).toBe(group.id);
      }
    });

    it('keeps cut shapes in their place among the group layers', () => {
      const group: GroupNode = {
        id: context.generateId(),
        name: 'Test Group',
        type: 'group',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
      };
      context.sceneGraph.addNode(group);
      // Bottom to top: erased, cut, missed, cut
      const tiny = createTestRectangle(-300, 0, 5, 5);
      const firstCut = createTestRectangle(-150, 0, 100, 100);
      const missed = createTestRectangle(0, 300, 100, 100);
      const secondCut = createTestRectangle(150, 0, 100, 100);
      for (const node of [tiny, firstCut, missed, secondCut]) {
        context.sceneGraph.addNode(node, group.id);
      }

      performStrokeErase({ x: -350, y: 0 }, { x: 350, y: 0 });

      // Each cut in two: its piece cut off just above it
      const children = context.sceneGraph.getChildren(group.id);
      expect(children.map((child) => child.name)).toEqual([
        'Test Rectangle',
        'Test Rectangle 2',
        'Test Rectangle',
        'Test Rectangle',
        'Test Rectangle 2',
      ]);
      expect(children[0]!.id).toBe(firstCut.id);
      expect(children[2]!.id).toBe(missed.id);
      expect(children[3]!.id).toBe(secondCut.id);
      expect(children.filter((child) => child.type === 'path')).toHaveLength(4);
    });

    /** A world-space box around a list of world points. */
    function boxOf(points: { x: number; y: number }[]) {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    }

    /** Cut a band across a shape in a transformed group; its world box must stay put. */
    function expectCutKeepsWorldBox(groupTransform: {
      position: { x: number; y: number };
      rotation: number;
      scale: { x: number; y: number };
    }) {
      const group: GroupNode = {
        id: context.generateId(),
        name: 'Transformed Group',
        type: 'group',
        parent: null,
        children: [],
        transform: { ...createDefaultTransform(), ...groupTransform },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
      };
      context.sceneGraph.addNode(group);
      const rect = createTestRectangle(0, 0, 100, 200);
      context.sceneGraph.addNode(rect, group.id);

      const before = boxOf(
        nodeToPolygon(rect, context.sceneGraph.getWorldTransform(rect.id))!.flatMap((polygon) =>
          polygon.flatMap((ring) => ring.map(([x, y]) => ({ x, y })))
        )
      );
      const midY = (before.minY + before.maxY) / 2;
      performStrokeErase({ x: before.minX - 50, y: midY }, { x: before.maxX + 50, y: midY });

      // Cut in two layers, which together cover what the shape did
      const pieces = context.sceneGraph.getChildren(group.id) as PathNode[];
      expect(pieces).toHaveLength(2);
      const after = boxOf(
        pieces.flatMap((piece) => {
          const world = context.sceneGraph.getWorldTransform(piece.id);
          return [...piece.points, ...(piece.subpaths ?? []).flat()].map((p) =>
            mat3.transformPoint(world, p.position)
          );
        })
      );
      expect(after.minX).toBeCloseTo(before.minX, 3);
      expect(after.maxX).toBeCloseTo(before.maxX, 3);
      expect(after.minY).toBeCloseTo(before.minY, 3);
      expect(after.maxY).toBeCloseTo(before.maxY, 3);
    }

    it('keeps the cut shape where it was inside a scaled group', () => {
      expectCutKeepsWorldBox({ position: { x: 40, y: -30 }, rotation: 0, scale: { x: 2, y: 2 } });
    });

    it('keeps the cut shape where it was inside a rotated group', () => {
      expectCutKeepsWorldBox({ position: { x: 40, y: -30 }, rotation: 90, scale: { x: 1, y: 1 } });
    });
  });

  // ==========================================================================
  // Undo Support
  // ==========================================================================

  describe('undo support', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should call onTransformStart once per gesture', () => {
      const onTransformStart = vi.fn();
      (context as any).onTransformStart = onTransformStart;

      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      expect(onTransformStart).toHaveBeenCalledTimes(1);
    });

    it('should call onTransformStart only once even when erasing multiple shapes', () => {
      const onTransformStart = vi.fn();
      (context as any).onTransformStart = onTransformStart;

      const rect1 = createTestRectangle(-100, 0, 80, 80);
      const rect2 = createTestRectangle(100, 0, 80, 80);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      tool.setSize(30);

      performStrokeErase({ x: -150, y: 0 }, { x: 150, y: 0 });

      expect(onTransformStart).toHaveBeenCalledTimes(1);
    });

    it('should not call onTransformStart when nothing is erased', () => {
      const onTransformStart = vi.fn();
      (context as any).onTransformStart = onTransformStart;

      // No shapes in scene
      performStrokeErase({ x: 0, y: 0 }, { x: 10, y: 10 });

      expect(onTransformStart).not.toHaveBeenCalled();
    });

    it('should call onTransformStart on first deletion in point mode', () => {
      const onTransformStart = vi.fn();
      (context as any).onTransformStart = onTransformStart;

      tool.setMode('point');

      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ]);
      context.sceneGraph.addNode(path);

      // Erase near first point
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 5, y: 5 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 5, y: 5 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(onTransformStart).toHaveBeenCalledTimes(1);
      // Path should still exist with fewer points
      const updatedPath = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedPath.points.length).toBe(3);
    });
  });

  // ==========================================================================
  // Preview Node
  // ==========================================================================

  describe('preview node', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should return null when not erasing', () => {
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should return null in point mode', () => {
      tool.setMode('point');
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should return a PathNode during drag in stroke mode', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 50, y: 50 } }));

      const preview = tool.getPreviewNode();
      expect(preview).not.toBeNull();
      expect(preview!.type).toBe('path');
      expect(preview!.opacity).toBe(0.3);
      expect(preview!.closed).toBe(true);
      expect(preview!.fills.length).toBe(1);
      expect(preview!.fills[0]!.color.r).toBe(255); // Red on the 0–255 scale
      expect(preview!.fills[0]!.color.g).toBe(0);
    });

    it('should return null after pointer up', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 50, y: 50 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 50 }, button: 0 }));

      expect(tool.getPreviewNode()).toBeNull();
    });
  });

  // ==========================================================================
  // Point Eraser Mode (unchanged behavior)
  // ==========================================================================

  describe('point eraser mode', () => {
    beforeEach(() => {
      tool.setMode('point');
      tool.setSize(20);
    });

    it('should delete individual points from path', () => {
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ]);
      context.sceneGraph.addNode(path);

      // Erase near first point
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 5, y: 5 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 5, y: 5 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Path should still exist with fewer points
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const updatedPath = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedPath.points.length).toBe(3);
    });

    it('does not erase points from a locked path (F048)', () => {
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ]);
      path.locked = true;
      context.sceneGraph.addNode(path);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 5, y: 5 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 5, y: 5 }, button: 0 }));

      expect(context.sceneGraph.getNode(path.id)).toBeDefined();
      expect((context.sceneGraph.getNode(path.id) as PathNode).points.length).toBe(4);
    });

    it('does not erase points from a hidden path (F048)', () => {
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ]);
      path.visible = false;
      context.sceneGraph.addNode(path);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 5, y: 5 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 5, y: 5 }, button: 0 }));

      expect((context.sceneGraph.getNode(path.id) as PathNode).points.length).toBe(4);
    });

    it('should delete entire path when less than 2 points remain', () => {
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ]);
      context.sceneGraph.addNode(path);

      // Erase both points
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Path should be deleted since it has less than 2 points
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should open closed path when points are removed', () => {
      const path = createTestPath(
        0,
        0,
        [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
          { x: 100, y: 0 },
        ],
        true
      );
      context.sceneGraph.addNode(path);

      // Erase one point
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 5 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 5 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const updatedPath = context.sceneGraph.getNode(path.id) as PathNode;
      // Path should become open when points are removed
      expect(updatedPath.closed).toBe(false);
    });

    it('should not affect rectangles in point mode', () => {
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Rectangle should not be affected in point mode
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should erase multiple points along the stroke', () => {
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 150, y: 0 },
        { x: 200, y: 0 },
      ]);
      context.sceneGraph.addNode(path);

      // Start erasing near first point
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Move across multiple points
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 50, y: 0 } }));

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 0 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const updatedPath = context.sceneGraph.getNode(path.id) as PathNode;
      // Should have removed 2 points (first and second)
      expect(updatedPath.points.length).toBe(3);
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('should cancel erasing on deactivate', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: -150 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Deactivate while erasing (before pointer up finalizes)
      tool.onDeactivate();

      // Rectangle should still exist (stroke not finalized)
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      expect(context.sceneGraph.getNode(rect.id)).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should ignore non-left mouse buttons', () => {
      tool.setMode('stroke');
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 2, // Right button
      });
      tool.onPointerDown(downEvent);

      // Should not start erasing
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should ignore pointer move when not erasing', () => {
      tool.setMode('stroke');
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
      });
      tool.onPointerMove(moveEvent);

      // Should not crash or affect nodes
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should ignore pointer up when not erasing', () => {
      tool.setMode('stroke');
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Should not crash or affect nodes
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should handle empty scene graph', () => {
      tool.setMode('stroke');
      performStrokeErase({ x: 0, y: 0 }, { x: 50, y: 50 });

      // Should not crash
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });
});
