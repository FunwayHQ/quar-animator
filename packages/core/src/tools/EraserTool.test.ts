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
      cornerRadius: 0,
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
  function createTestPath(x: number, y: number, points: { x: number; y: number }[]): PathNode {
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
      closed: false,
      fills: [],
      strokes: [context.defaultStroke],
    };
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
  // Stroke Eraser Mode
  // ==========================================================================

  describe('stroke eraser mode', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should delete rectangle when eraser passes over it', () => {
      // Add a rectangle at (50, 50)
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase at the rectangle's position
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

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should delete ellipse when eraser passes over it', () => {
      const ellipse = createTestEllipse(100, 100, 30, 20);
      context.sceneGraph.addNode(ellipse);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should delete path when eraser passes over a point', () => {
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ]);
      context.sceneGraph.addNode(path);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

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

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should not delete shapes that are not touched', () => {
      const rect = createTestRectangle(50, 50, 20, 20);
      context.sceneGraph.addNode(rect);

      // Erase far from the rectangle
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 500, y: 500 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 500, y: 500 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should delete multiple shapes in a single stroke', () => {
      const rect1 = createTestRectangle(50, 50, 20, 20);
      const rect2 = createTestRectangle(100, 50, 20, 20);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      expect(context.sceneGraph.getNodeCount()).toBe(2);

      // Start erasing near first rectangle
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Move to second rectangle
      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should not delete same shape twice in one stroke', () => {
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Move within the same rectangle multiple times
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 55, y: 55 } }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 60, y: 60 } }));

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 60, y: 60 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Shape should be deleted (only once)
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should clear selection when erasing selected nodes', () => {
      const rect = createTestRectangle(50, 50, 20, 20);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds([rect.id]);
      expect(context.getSelectedIds().size).toBe(1);

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

      expect(context.getSelectedIds().size).toBe(0);
    });
  });

  // ==========================================================================
  // Point Eraser Mode
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
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ]);
      path.closed = true;
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
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 500, y: 500 }, // Away from rect
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Deactivate while erasing
      tool.onDeactivate();

      // Should have reset state
      // Rectangle should still exist (wasn't touched)
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should ignore non-left mouse buttons', () => {
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 2, // Right button
      });
      tool.onPointerDown(downEvent);

      // Should not start erasing
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should ignore pointer move when not erasing', () => {
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
      });
      tool.onPointerMove(moveEvent);

      // Should not erase without pointer down
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should ignore pointer up when not erasing', () => {
      const rect = createTestRectangle(50, 50, 40, 40);
      context.sceneGraph.addNode(rect);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Should not crash or affect nodes
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should handle empty scene graph', () => {
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

      // Should not crash
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should erase paths by their segment midpoints', () => {
      // Create a path that spans across an area
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);
      context.sceneGraph.addNode(path);
      tool.setMode('stroke');
      tool.setSize(30);

      // Erase at midpoint of segment
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 0 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Path should be deleted
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Bounds Checking
  // ==========================================================================

  describe('bounds checking', () => {
    it('should quickly reject shapes outside eraser bounds', () => {
      // Create many shapes far from eraser position
      for (let i = 0; i < 10; i++) {
        const rect = createTestRectangle(1000 + i * 100, 1000, 20, 20);
        context.sceneGraph.addNode(rect);
      }
      expect(context.sceneGraph.getNodeCount()).toBe(10);

      tool.setSize(10);
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

      // All shapes should remain (none in eraser range)
      expect(context.sceneGraph.getNodeCount()).toBe(10);
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

    it('should call onTransformStart on first deletion in stroke mode', () => {
      const onTransformStart = vi.fn();
      (context as any).onTransformStart = onTransformStart;

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

      expect(onTransformStart).toHaveBeenCalledTimes(1);
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should call onTransformStart only once per gesture', () => {
      const onTransformStart = vi.fn();
      (context as any).onTransformStart = onTransformStart;

      const rect1 = createTestRectangle(50, 50, 40, 40);
      const rect2 = createTestRectangle(200, 50, 40, 40);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);

      // Start erasing near first rectangle
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Move to second rectangle
      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Both rects should be deleted but onTransformStart called only once
      expect(context.sceneGraph.getNodeCount()).toBe(0);
      expect(onTransformStart).toHaveBeenCalledTimes(1);
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
  // World Transform Hit Testing
  // ==========================================================================

  describe('world transform hit testing', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should erase rotated rectangle', () => {
      // Create a 60x60 rectangle at (100,100) rotated 45 degrees
      const rect = createTestRectangle(100, 100, 60, 60);
      rect.transform.rotation = 45;
      context.sceneGraph.addNode(rect);

      // Point at (135, 100) is outside the axis-aligned 60x60 box
      // (which extends from ~70 to ~130) but inside the 45-degree rotated square
      // (diamond vertices at ~142, ~58 along each axis from center)
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 135, y: 100 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 135, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should erase scaled node', () => {
      // Create a small 10x10 rectangle at origin, scaled 5x
      const rect = createTestRectangle(0, 0, 10, 10);
      rect.transform.scale = { x: 5, y: 5 };
      context.sceneGraph.addNode(rect);

      // Erase at (20, 0) which is outside the unscaled 10x10 bounds
      // but inside the scaled 50x50 bounds
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 20, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 20, y: 0 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should correctly miss a rotated rectangle', () => {
      // Create a small 20x20 rectangle at (100,100) rotated 45 degrees
      const rect = createTestRectangle(100, 100, 20, 20);
      rect.transform.rotation = 45;
      context.sceneGraph.addNode(rect);

      // Erase far outside at (200, 200) — well beyond rotated bounds
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 200 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 200 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });
  });

  // ==========================================================================
  // Polygon Erasure
  // ==========================================================================

  describe('polygon erasure', () => {
    // Helper to create a test polygon node
    function createTestPolygon(
      x: number,
      y: number,
      radius: number,
      sides: number,
      innerRadius?: number
    ): PolygonNode {
      const transform = createDefaultTransform();
      transform.position = { x, y };
      return {
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
        radius,
        sides,
        innerRadius,
        fills: [context.defaultFill],
        strokes: [context.defaultStroke],
      };
    }

    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should erase polygon node in stroke mode', () => {
      const polygon = createTestPolygon(50, 50, 30, 6);
      context.sceneGraph.addNode(polygon);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase at the polygon's center
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

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should erase star node (polygon with innerRadius)', () => {
      const star = createTestPolygon(80, 80, 30, 5, 15);
      context.sceneGraph.addNode(star);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase at the star's center
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 80, y: 80 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 80, y: 80 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Bezier Path Intersection
  // ==========================================================================

  describe('bezier path intersection', () => {
    // Helper to create a path with bezier handles
    function createTestPathWithHandles(): PathNode {
      const transform = createDefaultTransform();
      transform.position = { x: 0, y: 0 };
      transform.anchor = { x: 0, y: 0 };
      return {
        id: context.generateId(),
        name: 'Bezier Path',
        type: 'path',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        points: [
          {
            position: { x: 0, y: 0 },
            handleIn: null,
            handleOut: { x: 50, y: 50 },
            type: 'smooth',
          },
          {
            position: { x: 200, y: 0 },
            handleIn: { x: -50, y: 50 },
            handleOut: null,
            type: 'smooth',
          },
        ],
        closed: false,
        fills: [],
        strokes: [context.defaultStroke],
      };
    }

    beforeEach(() => {
      tool.setMode('stroke');
    });

    it('should erase path by bezier segment (not just points)', () => {
      // Path from (0,0) to (200,0) with handles that make the curve bulge upward
      // The curve passes near y=37 at x=100 (cubic bezier with symmetric handles)
      const path = createTestPathWithHandles();
      context.sceneGraph.addNode(path);
      tool.setSize(30);

      // Erase at (100, 40) — near the bezier curve's apex, far from endpoints
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 40 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 40 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Path should be deleted because eraser hits the bezier curve
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should miss path when eraser is far from all segments', () => {
      // Straight horizontal path from (0,0) to (200,0) with no handles
      const path = createTestPath(0, 0, [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ]);
      path.transform.anchor = { x: 0, y: 0 };
      context.sceneGraph.addNode(path);
      tool.setSize(10);

      // Erase at (100, 100) — far above the path
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Path should NOT be deleted
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });
  });

  // ==========================================================================
  // Image and Text Erasure
  // ==========================================================================

  describe('image and text erasure', () => {
    beforeEach(() => {
      tool.setMode('stroke');
      tool.setSize(20);
    });

    it('should erase image node in stroke mode', () => {
      const transform = createDefaultTransform();
      transform.position = { x: 100, y: 100 };
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
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase at the image's position
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should erase text node in stroke mode', () => {
      const transform = createDefaultTransform();
      transform.position = { x: 50, y: 50 };
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
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Erase at the text's position
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

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });
});
