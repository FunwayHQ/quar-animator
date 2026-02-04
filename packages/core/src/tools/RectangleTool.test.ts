/**
 * Tests for RectangleTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RectangleTool } from './RectangleTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

describe('RectangleTool', () => {
  let context: ToolContext;
  let tool: RectangleTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new RectangleTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('rectangle');
    });

    it('should have crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  // ==========================================================================
  // Rectangle Creation
  // ==========================================================================

  describe('rectangle creation', () => {
    it('should create rectangle on drag', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Check that a node was added to scene graph
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Check the node properties
      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0];
      expect(rect.type).toBe('rectangle');
      expect((rect as any).width).toBe(100);
      expect((rect as any).height).toBe(50);
    });

    it('should create rectangle with correct position (center)', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 10, y: 20 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 110, y: 70 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0];
      // Position should be center of rectangle
      expect(rect.transform.position.x).toBe(60); // 10 + 100/2
      expect(rect.transform.position.y).toBe(45); // 20 + 50/2
    });

    it('should constrain to square when shift is held', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        shiftKey: true,
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0] as any;
      expect(rect.width).toBe(rect.height);
      expect(rect.width).toBe(100); // Takes larger dimension
    });

    it('should draw from center when alt is held', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 80 },
        altKey: true,
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0] as any;
      expect(rect.width).toBe(100); // 50 * 2
      expect(rect.height).toBe(60); // 30 * 2
      expect(rect.transform.position.x).toBe(50); // Center stays at start point
      expect(rect.transform.position.y).toBe(50);
    });

    it('should enforce minimum size', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 0.5, y: 0.5 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Should not create a rectangle smaller than minimum size
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should select the new rectangle after creation', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const selectedIds = context.getSelectedIds();
      expect(selectedIds.size).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(selectedIds.has(nodes[0].id)).toBe(true);
    });

    it('should apply default fill', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0] as any;
      expect(rect.fill).toEqual(context.defaultFill);
    });

    it('should apply default stroke', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0] as any;
      expect(rect.stroke).toEqual(context.defaultStroke);
    });
  });

  // ==========================================================================
  // Preview
  // ==========================================================================

  describe('preview', () => {
    it('should show preview while dragging', () => {
      expect(tool.getPreviewNode()).toBeNull();

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      expect(tool.getPreviewNode()).not.toBeNull();
      expect(tool.getPreviewNode()?.type).toBe('rectangle');
    });

    it('should update preview on move', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
      });
      tool.onPointerMove(moveEvent);

      const preview = tool.getPreviewNode() as any;
      expect(preview.width).toBe(100);
      expect(preview.height).toBe(50);
    });

    it('should clear preview after creation', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(tool.getPreviewNode()).toBeNull();
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should cancel drawing on Escape', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      expect(tool.getPreviewNode()).not.toBeNull();

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(tool.getPreviewNode()).toBeNull();
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should ignore non-left mouse buttons', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 1, // Middle button
      });
      tool.onPointerDown(downEvent);

      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should handle drag in negative direction', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 60 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const rect = nodes[0] as any;
      expect(rect.width).toBe(50);
      expect(rect.height).toBe(40);
    });

    it('should handle same start and end position', () => {
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

      // Should not create rectangle
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });
});
