/**
 * Tests for EllipseTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EllipseTool } from './EllipseTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

describe('EllipseTool', () => {
  let context: ToolContext;
  let tool: EllipseTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new EllipseTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('ellipse');
    });

    it('should have crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  // ==========================================================================
  // Ellipse Creation
  // ==========================================================================

  describe('ellipse creation', () => {
    it('should create ellipse on drag', () => {
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

      expect(context.sceneGraph.getNodeCount()).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const ellipse = nodes[0] as any;
      expect(ellipse.type).toBe('ellipse');
      expect(ellipse.radiusX).toBe(50); // Width / 2
      expect(ellipse.radiusY).toBe(25); // Height / 2
    });

    it('should create ellipse with correct center position', () => {
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
      const ellipse = nodes[0];
      // Center should be midpoint
      expect(ellipse.transform.position.x).toBe(60); // 10 + 100/2
      expect(ellipse.transform.position.y).toBe(45); // 20 + 50/2
    });

    it('should constrain to circle when shift is held', () => {
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
      const ellipse = nodes[0] as any;
      expect(ellipse.radiusX).toBe(ellipse.radiusY);
      expect(ellipse.radiusX).toBe(50); // 100 / 2
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
      const ellipse = nodes[0] as any;
      expect(ellipse.radiusX).toBe(50); // Distance in X
      expect(ellipse.radiusY).toBe(30); // Distance in Y
      expect(ellipse.transform.position.x).toBe(50); // Center at start
      expect(ellipse.transform.position.y).toBe(50);
    });

    it('should enforce minimum size', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 0.1, y: 0.1 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should select the new ellipse after creation', () => {
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
      const ellipse = nodes[0] as any;
      expect(ellipse.fill).toEqual(context.defaultFill);
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
      const ellipse = nodes[0] as any;
      expect(ellipse.stroke).toEqual(context.defaultStroke);
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
      expect(tool.getPreviewNode()?.type).toBe('ellipse');
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
      expect(preview.radiusX).toBe(50);
      expect(preview.radiusY).toBe(25);
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
        button: 2, // Right button
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
      const ellipse = nodes[0] as any;
      expect(ellipse.radiusX).toBe(25);
      expect(ellipse.radiusY).toBe(20);
    });
  });
});
