/**
 * Tests for SelectionTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionTool } from './SelectionTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import type { RectangleNode, EllipseNode, PolygonNode, BoneNode, ArtboardNode } from '@quar/types';

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
    fills: [{ type: 'solid', color: { r: 237, g: 100, b: 149, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
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
    fills: [{ type: 'solid', color: { r: 149, g: 237, b: 100, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function createTestBone(id: string, x: number, y: number, length: number, rotation = 0): BoneNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };
  transform.rotation = rotation;
  transform.anchor = { x: 0, y: 0 };

  return {
    id,
    name: `Bone ${id}`,
    type: 'bone',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    length,
    boneStyle: 'octahedral',
    boneColor: '#E0E0E0',
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

    // X1-6: Escape cancels marquee selection
    it('should cancel marquee selection on Escape', () => {
      // Click on empty space to start marquee
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
          button: 0,
        })
      );

      // Drag to form marquee
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 600, y: 600 },
        })
      );

      expect(tool.getMode()).toBe('marquee');

      // Escape should cancel marquee
      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(tool.getMode()).toBe('idle');
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
  // Alt (Center-Origin) Resize
  // ==========================================================================

  describe('center-origin resize (alt key)', () => {
    it('should resize symmetrically from center with alt key', () => {
      // Rectangle at (100, 100), size 100x100
      // Bounds: x=50, y=50, width=100, height=100
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Bottom-right corner at (150, 150)
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

      // Drag right by 25 with alt key (should double to 50 total expansion)
      const endWorldPos = { x: 175, y: 175 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          altKey: true,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          altKey: true,
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // With alt key: delta of 25 in each direction is doubled to 50
      // New size: 100 + 50 = 150 x 150
      expect(resizedRect.width).toBe(150);
      expect(resizedRect.height).toBe(150);
    });

    it('should keep center position fixed during alt-resize', () => {
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

      const endWorldPos = { x: 175, y: 175 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          altKey: true,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          altKey: true,
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // Center should remain at (100, 100) - the original center
      // Position = center of the node
      expect(resizedRect.transform.position.x).toBe(100);
      expect(resizedRect.transform.position.y).toBe(100);
    });

    it('should combine alt+shift for constrained center-origin resize', () => {
      // Rectangle at (100, 100), size 100x100
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

      // Drag asymmetrically with both shift + alt
      const endWorldPos = { x: 200, y: 170 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
          altKey: true,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
          altKey: true,
          button: 0,
        })
      );

      const resizedRect = context.sceneGraph.getNode('rect1') as RectangleNode;
      // With shift, aspect ratio preserved (1:1 for this rect)
      expect(resizedRect.width).toBe(resizedRect.height);
    });
  });

  // ==========================================================================
  // Rotating Nodes
  // ==========================================================================

  describe('rotating nodes', () => {
    // Helper: get a screen position just outside a corner of the selection bounds
    // for triggering the Figma-style rotation zone.
    // The point must be:
    //   - Outside the screen-space bounds rect
    //   - Within rotationZoneRadius (20px) of the corner
    //   - Beyond handleHitRadius (12px) so it doesn't hit the resize handle
    // Camera: viewport 800x600, zoom 1, worldToScreen: sx=400+wx, sy=300-wy
    // So world offset (-15, 0) → screen offset (-15, 0), distance=15 from corner
    function getRotationZonePoint(
      worldCorner: { x: number; y: number },
      offsetX: number,
      offsetY: number
    ) {
      const worldPos = { x: worldCorner.x + offsetX, y: worldCorner.y + offsetY };
      const screenPos = context.camera.worldToScreen(worldPos);
      return { worldPos, screenPos };
    }

    it('should enter rotating mode when clicking in rotation zone outside corner', () => {
      // Rect centered at (100, 100) with size 100x100
      // Bounds: x=50, y=50, width=100, height=100
      // Top-left corner world (50, 50). Outside that corner = x<50, y<50
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Click outside the top-left corner (world Y-up: below 50 = outside top in world)
      const { worldPos, screenPos } = getRotationZonePoint({ x: 50, y: 50 }, -15, 0);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: worldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('rotating');
    });

    it('should rotate rectangle by dragging from rotation zone', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      expect(rect.transform.rotation).toBe(0);

      // Start at rotation zone outside top-left corner
      const { worldPos, screenPos } = getRotationZonePoint({ x: 50, y: 50 }, -15, 0);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: worldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      // Drag to the right to rotate
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
      expect(rotatedRect?.transform.rotation).not.toBe(0);
    });

    it('should constrain rotation to 15 degree increments with shift key', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const { worldPos, screenPos } = getRotationZonePoint({ x: 50, y: 50 }, -15, 0);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: worldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      // Drag to rotate with shift held
      const endWorldPos = { x: 130, y: 50 };
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
      const rotation = rotatedRect?.transform.rotation ?? 0;
      expect(rotation % 15).toBe(0);
    });

    it('should rotate multiple selected nodes together', () => {
      const rect1 = createTestRectangle('rect1', 100, 100, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 100, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect1', 'rect2']);

      // Combined bounds: x=50 to x=250, y=50 to y=150
      // Top-left corner of combined bounds at world (50, 50)
      const { worldPos, screenPos } = getRotationZonePoint({ x: 50, y: 50 }, -15, 0);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: worldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

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

      expect(rotatedRect1?.transform.rotation).toBe(rotatedRect2?.transform.rotation);
    });

    it('should return to idle mode after rotation completes', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      const { worldPos, screenPos } = getRotationZonePoint({ x: 50, y: 50 }, -15, 0);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: worldPos,
          screenPosition: screenPos,
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

    it('should provide rotate cursor when hovering rotation zone', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      expect(tool.getCursor()).toBe('default');

      // Simulate hover over rotation zone outside top-left corner
      const { worldPos, screenPos } = getRotationZonePoint({ x: 50, y: 50 }, -15, 0);

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: worldPos,
          screenPosition: screenPos,
        })
      );

      // Should have a rotate cursor (data URI with 'pointer' fallback)
      const cursor = tool.getCursor();
      expect(cursor).toContain('url(');
      expect(cursor).toContain('pointer');
    });

    it('should preserve initial rotation offset when applying rotation', () => {
      const rect = createTestRectangle('rect1', 100, 100, 100, 100);
      rect.transform.rotation = 45; // Start with 45 degree rotation
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // With 45° rotation, hitTest inverse-rotates screenPoint by +45° around screenCenter.
      // We need the INVERSE-ROTATED point to be:
      //   - outside the un-rotated screen bounds [450,550] x [150,250]
      //   - within 20px of a corner but beyond 12px (hit radius)
      // Strategy: pick a point 15px left of the un-rotated top-left corner screen (450, 250)
      // in un-rotated space: (435, 250). Then rotate that by -45° to get the actual screen point.
      const screenCenter = context.camera.worldToScreen({ x: 100, y: 100 }); // (500, 200)
      const targetUnrotated = { x: 435, y: 250 }; // 15px left of corner (450, 250)

      // Reverse: actual screen = rotate(targetUnrotated, -45°, screenCenter)
      const revAngle = -45 * (Math.PI / 180);
      const tdx = targetUnrotated.x - screenCenter.x;
      const tdy = targetUnrotated.y - screenCenter.y;
      const actualScreen = {
        x: screenCenter.x + tdx * Math.cos(revAngle) - tdy * Math.sin(revAngle),
        y: screenCenter.y + tdx * Math.sin(revAngle) + tdy * Math.cos(revAngle),
      };
      const actualWorld = context.camera.screenToWorld(actualScreen);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: actualWorld,
          screenPosition: actualScreen,
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
      expect(rotatedRect?.transform.rotation).not.toBe(45);
    });
  });

  // ==========================================================================
  // Bone Chain Selection
  // ==========================================================================

  describe('bone chain selection', () => {
    it('should select child bone directly, not walk to root bone', () => {
      // Create a 2-bone chain: rootBone -> childBone
      const rootBone = createTestBone('rootBone', 100, 100, 60);
      const childBone = createTestBone('childBone', 60, 0, 40);

      context.sceneGraph.addNode(rootBone);
      context.sceneGraph.addNode(childBone);
      context.sceneGraph.moveNode('childBone', 'rootBone');

      // Click on the child bone's position (world position = parent tip)
      // getWorldTransform of childBone would give us its world position
      // But for hit testing, we just click at a position that overlaps the child bone
      const childWorldPos = { x: 160, y: 100 }; // parent pos (100,100) + child offset along parent's X
      const screenPos = context.camera.worldToScreen(childWorldPos);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: childWorldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: childWorldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      // The child bone should be selected, NOT the root bone
      // resolveHitToScope should stop walking at bone parents
      const selected = context.getSelectedIds();
      // If the child bone is hit, it should be selected directly
      // (not resolved to rootBone through parent walking)
      expect(selected.has('rootBone')).toBe(false);
    });

    it('should select grandchild bone directly', () => {
      // Create a 3-bone chain: root -> mid -> leaf
      const rootBone = createTestBone('rootBone', 100, 100, 50);
      const midBone = createTestBone('midBone', 50, 0, 40);
      const leafBone = createTestBone('leafBone', 40, 0, 30);

      context.sceneGraph.addNode(rootBone);
      context.sceneGraph.addNode(midBone);
      context.sceneGraph.addNode(leafBone);
      context.sceneGraph.moveNode('midBone', 'rootBone');
      context.sceneGraph.moveNode('leafBone', 'midBone');

      // Verify that the leaf bone's parent chain is: leafBone -> midBone -> rootBone
      const leaf = context.sceneGraph.getNode('leafBone');
      expect(leaf?.parent).toBe('midBone');
      const mid = context.sceneGraph.getNode('midBone');
      expect(mid?.parent).toBe('rootBone');

      // The resolveHitToScope for leafBone should return leafBone (not rootBone)
      // because walking stops at bone-type parents
    });

    it('should still select root bone when clicking root directly', () => {
      const rootBone = createTestBone('rootBone', 100, 100, 60);
      const childBone = createTestBone('childBone', 60, 0, 40);

      context.sceneGraph.addNode(rootBone);
      context.sceneGraph.addNode(childBone);
      context.sceneGraph.moveNode('childBone', 'rootBone');

      // Click on the root bone position
      const rootWorldPos = { x: 100, y: 100 };
      const screenPos = context.camera.worldToScreen(rootWorldPos);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: rootWorldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: rootWorldPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      // Root bone is at root level (parent === null), so it should be directly selectable
      // The root bone has no bone-type parent, so resolveHitToScope returns it
    });
  });

  // ==========================================================================
  // Artboard Support
  // ==========================================================================

  describe('artboard support', () => {
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

    it('should resize artboard by adjusting width and height directly', () => {
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      context.sceneGraph.addNode(artboard);
      context.setSelectedIds(['art1']);

      // Simulate resize via SelectionTool
      const startPos = { x: 400, y: 350 }; // bottom-right handle area
      const screenStart = context.camera.worldToScreen(startPos);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startPos,
          screenPosition: screenStart,
          button: 0,
        })
      );

      // After the drag, check that artboard still uses width/height (not scale)
      const node = context.sceneGraph.getNode('art1') as ArtboardNode;
      expect(node.type).toBe('artboard');
      expect(node.transform.scale).toEqual({ x: 1, y: 1 });
    });

    it('should prevent rotation on artboard nodes', () => {
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      context.sceneGraph.addNode(artboard);
      context.setSelectedIds(['art1']);

      // The artboard rotation should stay 0 after any operation
      const node = context.sceneGraph.getNode('art1') as ArtboardNode;
      expect(node.transform.rotation).toBe(0);
    });

    it('should enter artboard on double-click like group', () => {
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      context.sceneGraph.addNode(artboard);

      let enteredGroupId: string | null = null;
      context.setEnteredGroupId = (id) => {
        enteredGroupId = id;
      };

      // Click on artboard position
      const clickPos = { x: 200, y: 200 };
      const screenPos = context.camera.worldToScreen(clickPos);

      // Double-click (clickCount: 2)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: clickPos,
          screenPosition: screenPos,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: clickPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      // First click selects the artboard
      // Double-click enters it
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: clickPos,
          screenPosition: screenPos,
          button: 0,
          // @ts-expect-error clickCount not in strict type
          clickCount: 2,
        })
      );

      expect(enteredGroupId).toBe('art1');
    });

    it('should auto-reparent node dropped onto artboard', () => {
      // Create an artboard at center 200,200 with size 400x300
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      context.sceneGraph.addNode(artboard);

      // Create a rectangle at root level, far from artboard
      const rect = createTestRectangle('rect1', -500, -500, 50, 50);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      expect(context.sceneGraph.getNode('rect1')!.parent).toBeNull();

      // Start move
      const startPos = { x: -500, y: -500 };
      const screenStart = context.camera.worldToScreen(startPos);
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startPos,
          screenPosition: screenStart,
          button: 0,
        })
      );

      // Move to inside the artboard (center 200,200)
      const endPos = { x: 200, y: 200 };
      const screenEnd = context.camera.worldToScreen(endPos);
      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd, button: 0 })
      );

      // Node should now be a child of the artboard
      const movedNode = context.sceneGraph.getNode('rect1')!;
      expect(movedNode.parent).toBe('art1');
    });

    it('should remove parent when node is moved out of artboard', () => {
      // Create an artboard at center 200,200 with size 400x300
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      context.sceneGraph.addNode(artboard);

      // Create a rectangle as child of artboard, at artboard-local position (0,0) = artboard center
      const rect = createTestRectangle('rect1', 0, 0, 50, 50);
      context.sceneGraph.addNode(rect);
      context.sceneGraph.moveNode('rect1', 'art1');
      expect(context.sceneGraph.getNode('rect1')!.parent).toBe('art1');

      // Enter the artboard scope (like double-clicking in real app)
      context.setEnteredGroupId?.('art1');

      context.setSelectedIds(['rect1']);

      // Start move from local (0,0) which is world (200,200)
      const startPos = { x: 200, y: 200 };
      const screenStart = context.camera.worldToScreen(startPos);
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startPos,
          screenPosition: screenStart,
          button: 0,
        })
      );

      // Move far outside the artboard
      const endPos = { x: -500, y: -500 };
      const screenEnd = context.camera.worldToScreen(endPos);
      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd, button: 0 })
      );

      // Node should now be at root level (no parent)
      const movedNode = context.sceneGraph.getNode('rect1')!;
      expect(movedNode.parent).toBeNull();
    });

    it('should not reparent artboard nodes themselves', () => {
      const artboard1 = createTestArtboard('art1', 200, 200, 400, 300);
      const artboard2 = createTestArtboard('art2', 800, 200, 400, 300);
      context.sceneGraph.addNode(artboard1);
      context.sceneGraph.addNode(artboard2);

      context.setSelectedIds(['art2']);

      // Move artboard2 on top of artboard1
      const startPos = { x: 800, y: 200 };
      const screenStart = context.camera.worldToScreen(startPos);
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startPos,
          screenPosition: screenStart,
          button: 0,
        })
      );

      const endPos = { x: 200, y: 200 };
      const screenEnd = context.camera.worldToScreen(endPos);
      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd, button: 0 })
      );

      // Artboard2 should stay at root level
      expect(context.sceneGraph.getNode('art2')!.parent).toBeNull();
    });

    it('should compute artboard bounds correctly for selection', () => {
      const artboard = createTestArtboard('art1', 100, 100, 200, 150);
      context.sceneGraph.addNode(artboard);
      context.setSelectedIds(['art1']);

      // Artboard with center at (100,100), size 200x150, anchor (0.5,0.5)
      // Local bounds: x=-100, y=-75, w=200, h=150
      const node = context.sceneGraph.getNode('art1') as ArtboardNode;
      expect(node.width).toBe(200);
      expect(node.height).toBe(150);
    });

    it('should skip invisible artboards during findArtboardAtPoint', () => {
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      artboard.visible = false;
      context.sceneGraph.addNode(artboard);

      const rect = createTestRectangle('rect1', -500, -500, 50, 50);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      // Move rect to artboard center — but artboard is invisible
      const startPos = { x: -500, y: -500 };
      const screenStart = context.camera.worldToScreen(startPos);
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: startPos, screenPosition: screenStart, button: 0 })
      );

      const endPos = { x: 200, y: 200 };
      const screenEnd = context.camera.worldToScreen(endPos);
      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: endPos, screenPosition: screenEnd, button: 0 })
      );

      // Node should stay at root since artboard is invisible
      expect(context.sceneGraph.getNode('rect1')!.parent).toBeNull();
    });

    it('should enter artboard and select child on click when artboard is already selected', () => {
      // Create artboard at center (200,200), size 400x300
      const artboard = createTestArtboard('art1', 200, 200, 400, 300);
      context.sceneGraph.addNode(artboard);

      // Create a rectangle as child of artboard, at local position (0,0) = artboard center
      const rect = createTestRectangle('rect1', 0, 0, 50, 50);
      context.sceneGraph.addNode(rect);
      context.sceneGraph.moveNode('rect1', 'art1');

      // Pre-select the artboard (simulating first click)
      context.setSelectedIds(['art1']);

      // Click on the child's position (artboard center = world 200,200)
      const clickPos = { x: 200, y: 200 };
      const screenPos = context.camera.worldToScreen(clickPos);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: clickPos,
          screenPosition: screenPos,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: clickPos,
          screenPosition: screenPos,
          button: 0,
        })
      );

      // Should have entered the artboard
      expect(context.getEnteredGroupId?.()).toBe('art1');
      // Should have selected the child rectangle
      expect(context.getSelectedIds().has('rect1')).toBe(true);
      expect(context.getSelectedIds().has('art1')).toBe(false);
    });
  });
});
