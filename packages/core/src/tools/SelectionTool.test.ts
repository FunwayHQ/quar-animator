/**
 * Tests for SelectionTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionTool } from './SelectionTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import type { RectangleNode, EllipseNode, PolygonNode } from '@quar/types';

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
    fill: { type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1 },
    stroke: null,
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
    fill: { type: 'solid', color: { r: 237, g: 100, b: 149, a: 1 }, opacity: 1 },
    stroke: null,
  };
}

function createTestPolygon(
  id: string,
  x: number,
  y: number,
  radius: number,
  sides: number = 5
): PolygonNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };

  return {
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
    radius,
    sides,
    fill: { type: 'solid', color: { r: 149, g: 237, b: 100, a: 1 }, opacity: 1 },
    stroke: null,
  };
}

describe('SelectionTool', () => {
  let context: ToolContext;
  let tool: SelectionTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new SelectionTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('selection');
    });

    it('should have default cursor', () => {
      expect(tool.cursor).toBe('default');
    });

    it('should start in idle mode', () => {
      expect(tool.getMode()).toBe('idle');
    });
  });

  // ==========================================================================
  // Click Selection
  // ==========================================================================

  describe('click selection', () => {
    it('should select node when clicking on it', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 }, // Center of rect
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('rect1')).toBe(true);
    });

    it('should clear selection when clicking empty space', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 200 }, // Far from rect
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 200 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should add to selection with Ctrl+click', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);

      // Select first rect
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      // Ctrl+click second rect
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 50 },
          ctrlKey: true,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 50 },
          ctrlKey: true,
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(2);
      expect(context.getSelectedIds().has('rect1')).toBe(true);
      expect(context.getSelectedIds().has('rect2')).toBe(true);
    });

    it('should remove from selection with Ctrl+click on selected', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect1', 'rect2']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          ctrlKey: true,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          ctrlKey: true,
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(1);
      expect(context.getSelectedIds().has('rect2')).toBe(true);
    });

    it('should select only clicked node without Ctrl', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 50 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 50 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(1);
      expect(context.getSelectedIds().has('rect2')).toBe(true);
    });

    it('should select polygon when clicking on it', () => {
      const polygon = createTestPolygon('polygon1', 100, 100, 50, 5);
      context.sceneGraph.addNode(polygon);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 }, // Center of polygon
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('polygon1')).toBe(true);
    });

    it('should select polygon when clicking near edge', () => {
      const polygon = createTestPolygon('polygon1', 100, 100, 50, 5);
      context.sceneGraph.addNode(polygon);

      // Click near the edge (within radius)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 140, y: 100 }, // 40 units from center, within radius of 50
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 140, y: 100 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('polygon1')).toBe(true);
    });

    it('should not select polygon when clicking outside', () => {
      const polygon = createTestPolygon('polygon1', 100, 100, 50, 5);
      context.sceneGraph.addNode(polygon);

      // Click outside the radius
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 200 }, // Far outside
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 200 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(0);
    });
  });

  // ==========================================================================
  // Moving Nodes
  // ==========================================================================

  describe('moving nodes', () => {
    it('should move selected node on drag', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 70, y: 60 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 70, y: 60 },
          button: 0,
        })
      );

      const movedRect = context.sceneGraph.getNode('rect1');
      expect(movedRect?.transform.position.x).toBe(70); // 50 + 20
      expect(movedRect?.transform.position.y).toBe(60); // 50 + 10
    });

    it('should move multiple selected nodes together', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect1', 'rect2']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 70, y: 60 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 70, y: 60 },
          button: 0,
        })
      );

      const movedRect1 = context.sceneGraph.getNode('rect1');
      const movedRect2 = context.sceneGraph.getNode('rect2');
      expect(movedRect1?.transform.position.x).toBe(70);
      expect(movedRect2?.transform.position.x).toBe(220); // 200 + 20
    });

    it('should enter moving mode when clicking selected node', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('moving');
    });
  });

  // ==========================================================================
  // Marquee Selection
  // ==========================================================================

  describe('marquee selection', () => {
    it('should start marquee on empty space drag', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('marquee');
      expect(tool.getMarqueeRect()).not.toBeNull();
    });

    it('should update marquee rect while dragging', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 50 },
        })
      );

      const marquee = tool.getMarqueeRect();
      expect(marquee?.width).toBe(100);
      expect(marquee?.height).toBe(50);
    });

    it('should select nodes within marquee', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 20, 20);
      const rect2 = createTestRectangle('rect2', 200, 50, 20, 20);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);

      // Marquee that only encompasses rect1
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('rect1')).toBe(true);
      expect(context.getSelectedIds().has('rect2')).toBe(false);
    });

    it('should clear marquee after selection', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 50 },
          button: 0,
        })
      );

      expect(tool.getMarqueeRect()).toBeNull();
      expect(tool.getMode()).toBe('idle');
    });

    it('should add to selection with Ctrl+marquee', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 20, 20);
      const rect2 = createTestRectangle('rect2', 200, 50, 20, 20);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect2']);

      // Marquee around rect1 with Ctrl
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          ctrlKey: true,
          button: 0,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          ctrlKey: true,
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(2);
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should delete selected nodes on Delete', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should delete selected nodes on Backspace', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onKeyDown({ key: 'Backspace' } as KeyboardEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should clear selection on Escape', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should select all on Ctrl+A', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);

      const event = { key: 'a', ctrlKey: true, preventDefault: () => {} } as KeyboardEvent;
      tool.onKeyDown(event);

      expect(context.getSelectedIds().size).toBe(2);
    });

    it('should nudge selected nodes with arrow keys', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const event = { key: 'ArrowRight', preventDefault: () => {} } as KeyboardEvent;
      tool.onKeyDown(event);

      expect(context.sceneGraph.getNode('rect1')?.transform.position.x).toBe(51);
    });

    it('should nudge by 10 with Shift+arrow', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const event = {
        key: 'ArrowRight',
        shiftKey: true,
        preventDefault: () => {},
      } as KeyboardEvent;
      tool.onKeyDown(event);

      expect(context.sceneGraph.getNode('rect1')?.transform.position.x).toBe(60);
    });

    it('should revert move on Escape during drag', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 150 },
        })
      );

      // Should be moved
      expect(context.sceneGraph.getNode('rect1')?.transform.position.x).toBe(150);

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      // Should be reverted
      expect(context.sceneGraph.getNode('rect1')?.transform.position.x).toBe(50);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should ignore non-left mouse buttons', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 2, // Right button
        })
      );

      expect(tool.getMode()).toBe('idle');
    });

    it('should not select invisible nodes', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      rect.visible = false;
      context.sceneGraph.addNode(rect);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should not clear selection with Ctrl+click on empty', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
          ctrlKey: true,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
          ctrlKey: true,
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(1);
    });
  });

  // ==========================================================================
  // Resizing Nodes
  // ==========================================================================

  describe('resizing nodes', () => {
    it('should enter resizing mode when clicking on a handle', () => {
      // Create a rectangle centered at (100, 100) with size 100x100
      // Bounds will be: x=50, y=50, width=100, height=100
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Screen position for bottom-right corner (150, 150 in world = 150, 150 in screen at zoom 1)
      const screenPos = context.camera.worldToScreen({ x: 150, y: 150 });

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 150 },
          screenPosition: screenPos,
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('resizing');
    });

    it('should resize rectangle from bottom-right handle', () => {
      // Rectangle at (100, 100), size 100x100
      // Bounds: x=50, y=50 to x=150, y=150
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      // Click on bottom-right corner
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag to expand by 50 in each direction
      const endWorldPos = { x: 200, y: 200 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // Original width 100 + delta 50 = 150
      expect(resizedRect.width).toBe(150);
      expect(resizedRect.height).toBe(150);
    });

    it('should resize rectangle from top-left handle', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Top-left corner is at (50, 50) in world
      const startScreenPos = context.camera.worldToScreen({ x: 50, y: 50 });
      const startWorldPos = { x: 50, y: 50 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag to shrink - move top-left inward by 20
      const endWorldPos = { x: 70, y: 70 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // Width: 100 - 20 = 80, Height: 100 - 20 = 80
      expect(resizedRect.width).toBe(80);
      expect(resizedRect.height).toBe(80);
    });

    it('should resize from right edge handle (horizontal only)', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Right edge midpoint is at (150, 100) in world
      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 100 });
      const startWorldPos = { x: 150, y: 100 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag right by 30
      const endWorldPos = { x: 180, y: 100 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      expect(resizedRect.width).toBe(130);
      expect(resizedRect.height).toBe(100); // Height unchanged
    });

    it('should resize from bottom edge handle (vertical only)', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Bottom edge midpoint is at (100, 150) in world
      const startScreenPos = context.camera.worldToScreen({ x: 100, y: 150 });
      const startWorldPos = { x: 100, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag down by 40
      const endWorldPos = { x: 100, y: 190 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      expect(resizedRect.width).toBe(100); // Width unchanged
      expect(resizedRect.height).toBe(140);
    });

    it('should resize ellipse from bottom-right handle', () => {
      // Ellipse at (100, 100) with radiusX=50, radiusY=50
      // Bounds: x=50, y=50 to x=150, y=150
      const ellipse = createTestEllipse('ellipse1', 100, 100, 50, 50);
      context.sceneGraph.addNode(ellipse);
      context.setSelectedIds(['ellipse1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag to expand by 50 in each direction
      const endWorldPos = { x: 200, y: 200 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedEllipse = context.sceneGraph.getNode('ellipse1') as EllipseNode;
      // Original radius 50, bounds expand by 50, so scale factor is 1.5
      // New radius = 50 * 1.5 = 75
      expect(resizedEllipse.radiusX).toBe(75);
      expect(resizedEllipse.radiusY).toBe(75);
    });

    it('should constrain aspect ratio with shift key', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag asymmetrically but with shift to constrain
      const endWorldPos = { x: 200, y: 170 }; // 50 right, 20 down
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // With shift, aspect ratio should be preserved (1:1 for this rect)
      expect(resizedRect.width).toBe(resizedRect.height);
    });

    it('should enforce minimum size', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Drag from bottom-right to collapse to near zero
      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Try to make it very small
      const endWorldPos = { x: 51, y: 51 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // Should not go below minimum size (1)
      expect(resizedRect.width).toBeGreaterThanOrEqual(1);
      expect(resizedRect.height).toBeGreaterThanOrEqual(1);
    });

    it('should return to idle mode after resize completes', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('resizing');

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 200 },
          screenPosition: context.camera.worldToScreen({ x: 200, y: 200 }),
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('idle');
    });

    it('should not start resize if clicking inside selection bounds (not on handle)', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Click in center of the rect, not on a handle
      const centerScreenPos = context.camera.worldToScreen({ x: 100, y: 100 });
      const centerWorldPos = { x: 100, y: 100 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: centerWorldPos,
          screenPosition: centerScreenPos,
          button: 0,
        })
      );

      // Should be in moving mode, not resizing
      expect(tool.getMode()).toBe('moving');
    });

    it('should provide resize cursor via getCursor method', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Default cursor
      expect(tool.getCursor()).toBe('default');

      // Simulate hover over bottom-right handle (visually top-right due to Y-up world coords)
      const handleScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 150 },
          screenPosition: handleScreenPos,
        })
      );

      // Should now have resize cursor (nesw for visual top-right)
      expect(tool.getCursor()).toBe('nesw-resize');
    });
  });

  // ==========================================================================
  // Rotating Nodes
  // ==========================================================================

  describe('rotating nodes', () => {
    it('should enter rotating mode when clicking on rotation handle', () => {
      // Create a rectangle centered at (100, 100) with size 100x100
      // Bounds: x=50, y=50, width=100, height=100
      // Rotation handle is above the top edge at (100, 50 - offset)
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Top edge center is at world (100, 50), rotation handle is above that
      // Default rotationHandleOffset is 20 (in screen pixels), at zoom 1 that's 20 world units
      const rotationHandleWorld = { x: 100, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('rotating');
    });

    it('should rotate rectangle by dragging rotation handle', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Initial rotation should be 0
      expect(rect.transform.rotation).toBe(0);

      // Start at rotation handle (above top center)
      const rotationHandleWorld = { x: 100, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
          button: 0,
        })
      );

      // Drag to the right to rotate clockwise
      // Moving from above center (100, 30) to the right of center (200, 100)
      // This is approximately a 90 degree clockwise rotation
      const endWorldPos = { x: 200, y: 100 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const rotatedRect = context.sceneGraph.getNode('rect1');
      // Rotation should have changed (approximately 90 degrees but depends on exact math)
      expect(rotatedRect?.transform.rotation).not.toBe(0);
    });

    it('should constrain rotation to 15 degree increments with shift key', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Start at rotation handle
      const rotationHandleWorld = { x: 100, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
          button: 0,
        })
      );

      // Drag to rotate with shift held
      const endWorldPos = { x: 130, y: 50 }; // Slight rotation
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
          button: 0,
        })
      );

      const rotatedRect = context.sceneGraph.getNode('rect1');
      // Rotation should be a multiple of 15
      const rotation = rotatedRect?.transform.rotation ?? 0;
      expect(rotation % 15).toBe(0);
    });

    it('should rotate multiple selected nodes together', () => {
      const rect1 = createTestRectangle('rect1', 100, 100, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 100, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect1', 'rect2']);

      // Combined bounds would be x=50 to x=250
      // Center of combined selection is (150, 100)
      // Top edge center would be at (150, 50)
      const rotationHandleWorld = { x: 150, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
          button: 0,
        })
      );

      // Rotate by some amount
      const endWorldPos = { x: 250, y: 100 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const rotatedRect1 = context.sceneGraph.getNode('rect1');
      const rotatedRect2 = context.sceneGraph.getNode('rect2');

      // Both nodes should have the same rotation delta applied
      expect(rotatedRect1?.transform.rotation).toBe(rotatedRect2?.transform.rotation);
    });

    it('should return to idle mode after rotation completes', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const rotationHandleWorld = { x: 100, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('rotating');

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 100 },
          screenPosition: context.camera.worldToScreen({ x: 150, y: 100 }),
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('idle');
    });

    it('should provide grab cursor when hovering rotation handle', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Default cursor
      expect(tool.getCursor()).toBe('default');

      // Simulate hover over rotation handle
      const rotationHandleWorld = { x: 100, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
        })
      );

      // Should have grab cursor for rotation handle
      expect(tool.getCursor()).toBe('grab');
    });

    it('should preserve initial rotation offset when applying rotation', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      rect.transform.rotation = 45; // Start with 45 degree rotation
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const rotationHandleWorld = { x: 100, y: 50 - 20 };
      const rotationHandleScreen = context.camera.worldToScreen(rotationHandleWorld);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rotationHandleWorld,
          screenPosition: rotationHandleScreen,
          button: 0,
        })
      );

      // Drag to add some rotation
      const endWorldPos = { x: 130, y: 70 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const rotatedRect = context.sceneGraph.getNode('rect1');
      // The rotation should be 45 + delta, so it should not be exactly 45
      // and should still contain the original offset
      expect(rotatedRect?.transform.rotation).not.toBe(45);
    });
  });
});
