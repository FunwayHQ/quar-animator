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

    it('should subtract from a rectangle when eraser passes through it', () => {
      // Large rectangle at origin
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase through the center of the rectangle
      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // The rectangle should be replaced by a PathNode (with hole cut out)
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.type).toBe('path');
      expect(resultNode.id).not.toBe(rect.id);
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

      // Should be replaced by a path (with a chunk removed)
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.type).toBe('path');
      expect(resultNode.id).not.toBe(ellipse.id);
    });

    it('should subtract from multiple shapes', () => {
      const rect1 = createTestRectangle(-100, 0, 80, 80);
      const rect2 = createTestRectangle(100, 0, 80, 80);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      tool.setSize(30);

      // Erase line that cuts through both rectangles
      performStrokeErase({ x: -150, y: 0 }, { x: 150, y: 0 });

      // Both should be replaced by path nodes
      const roots = context.sceneGraph.getRootNodes();
      expect(roots.length).toBe(2);
      for (const n of roots) {
        expect(n.type).toBe('path');
        expect(n.id).not.toBe(rect1.id);
        expect(n.id).not.toBe(rect2.id);
      }
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

      // Should be replaced
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.type).toBe('path');
      expect(resultNode.id).not.toBe(path.id);
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

      // Should be replaced by a path node
      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const resultNode = context.sceneGraph.getRootNodes()[0]!;
      expect(resultNode.type).toBe('path');
      expect(resultNode.id).not.toBe(polygon.id);
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
  });

  // ==========================================================================
  // Selection Updates
  // ==========================================================================

  describe('selection updates', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should update selection to new replacement node ID', () => {
      const rect = createTestRectangle(0, 0, 200, 200);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds([rect.id]);

      performStrokeErase({ x: 0, y: -150 }, { x: 0, y: 150 });

      // Selection should now contain the new node ID (not the old one)
      const selectedIds = context.getSelectedIds();
      expect(selectedIds.has(rect.id)).toBe(false);
      expect(selectedIds.size).toBe(1);

      const newNode = context.sceneGraph.getRootNodes()[0]!;
      expect(selectedIds.has(newNode.id)).toBe(true);
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

      // The group should still exist with one child (the replacement node)
      const updatedGroup = context.sceneGraph.getNode(group.id)!;
      expect(updatedGroup.children.length).toBe(1);
      const childId = updatedGroup.children[0]!;
      const child = context.sceneGraph.getNode(childId)!;
      expect(child.type).toBe('path');
      expect(child.parent).toBe(group.id);
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
      expect(preview!.fills[0]!.color.r).toBe(1); // Red
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
