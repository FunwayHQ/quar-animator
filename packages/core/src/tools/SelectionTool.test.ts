/**
 * Tests for SelectionTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionTool } from './SelectionTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import type { RectangleNode } from '@quar/types';

function createTestRectangle(id: string, x: number, y: number, width: number, height: number): RectangleNode {
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

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 }, // Center of rect
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      expect(context.getSelectedIds().has('rect1')).toBe(true);
    });

    it('should clear selection when clicking empty space', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 200, y: 200 }, // Far from rect
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 200, y: 200 },
        button: 0,
      }));

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should add to selection with Ctrl+click', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);

      // Select first rect
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      // Ctrl+click second rect
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        ctrlKey: true,
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        ctrlKey: true,
        button: 0,
      }));

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

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        ctrlKey: true,
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        ctrlKey: true,
        button: 0,
      }));

      expect(context.getSelectedIds().size).toBe(1);
      expect(context.getSelectedIds().has('rect2')).toBe(true);
    });

    it('should select only clicked node without Ctrl', () => {
      const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
      const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
      context.sceneGraph.addNode(rect1);
      context.sceneGraph.addNode(rect2);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        button: 0,
      }));

      expect(context.getSelectedIds().size).toBe(1);
      expect(context.getSelectedIds().has('rect2')).toBe(true);
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

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      tool.onPointerMove(createMockPointerEvent({
        worldPosition: { x: 70, y: 60 },
      }));

      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 70, y: 60 },
        button: 0,
      }));

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

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      tool.onPointerMove(createMockPointerEvent({
        worldPosition: { x: 70, y: 60 },
      }));

      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 70, y: 60 },
        button: 0,
      }));

      const movedRect1 = context.sceneGraph.getNode('rect1');
      const movedRect2 = context.sceneGraph.getNode('rect2');
      expect(movedRect1?.transform.position.x).toBe(70);
      expect(movedRect2?.transform.position.x).toBe(220); // 200 + 20
    });

    it('should enter moving mode when clicking selected node', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      expect(tool.getMode()).toBe('moving');
    });
  });

  // ==========================================================================
  // Marquee Selection
  // ==========================================================================

  describe('marquee selection', () => {
    it('should start marquee on empty space drag', () => {
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      }));

      expect(tool.getMode()).toBe('marquee');
      expect(tool.getMarqueeRect()).not.toBeNull();
    });

    it('should update marquee rect while dragging', () => {
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      }));

      tool.onPointerMove(createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
      }));

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
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      }));

      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      }));

      expect(context.getSelectedIds().has('rect1')).toBe(true);
      expect(context.getSelectedIds().has('rect2')).toBe(false);
    });

    it('should clear marquee after selection', () => {
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      }));

      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      }));

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
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        ctrlKey: true,
        button: 0,
      }));

      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        ctrlKey: true,
        button: 0,
      }));

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

      const event = { key: 'ArrowRight', shiftKey: true, preventDefault: () => {} } as KeyboardEvent;
      tool.onKeyDown(event);

      expect(context.sceneGraph.getNode('rect1')?.transform.position.x).toBe(60);
    });

    it('should revert move on Escape during drag', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      tool.onPointerMove(createMockPointerEvent({
        worldPosition: { x: 150, y: 150 },
      }));

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
      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 2, // Right button
      }));

      expect(tool.getMode()).toBe('idle');
    });

    it('should not select invisible nodes', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      rect.visible = false;
      context.sceneGraph.addNode(rect);

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      }));

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should not clear selection with Ctrl+click on empty', () => {
      const rect = createTestRectangle('rect1', 50, 50, 100, 100);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onPointerDown(createMockPointerEvent({
        worldPosition: { x: 500, y: 500 },
        ctrlKey: true,
        button: 0,
      }));
      tool.onPointerUp(createMockPointerEvent({
        worldPosition: { x: 500, y: 500 },
        ctrlKey: true,
        button: 0,
      }));

      expect(context.getSelectedIds().size).toBe(1);
    });
  });
});
