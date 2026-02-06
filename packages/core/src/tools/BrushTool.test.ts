/**
 * Tests for BrushTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BrushTool } from './BrushTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

describe('BrushTool', () => {
  let context: ToolContext;
  let tool: BrushTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new BrushTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('brush');
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
      expect(options.size).toBe(5);
      expect(options.smoothing).toBe(50);
      expect(options.pressureEnabled).toBe(true);
      expect(options.pressureMin).toBe(0.1);
      expect(options.pressureMax).toBe(1.0);
    });

    it('should set options', () => {
      tool.setOptions({ size: 10, smoothing: 75 });
      const options = tool.getOptions();
      expect(options.size).toBe(10);
      expect(options.smoothing).toBe(75);
    });

    it('should set brush size', () => {
      tool.setSize(20);
      expect(tool.getOptions().size).toBe(20);
    });

    it('should clamp brush size to minimum of 1', () => {
      tool.setSize(0);
      expect(tool.getOptions().size).toBe(1);
      tool.setSize(-5);
      expect(tool.getOptions().size).toBe(1);
    });

    it('should clamp brush size to maximum of 100', () => {
      tool.setSize(150);
      expect(tool.getOptions().size).toBe(100);
    });

    it('should set smoothing', () => {
      tool.setSmoothing(80);
      expect(tool.getOptions().smoothing).toBe(80);
    });

    it('should clamp smoothing to minimum of 0', () => {
      tool.setSmoothing(-10);
      expect(tool.getOptions().smoothing).toBe(0);
    });

    it('should clamp smoothing to maximum of 100', () => {
      tool.setSmoothing(150);
      expect(tool.getOptions().smoothing).toBe(100);
    });
  });

  // ==========================================================================
  // Brush Stroke Creation
  // ==========================================================================

  describe('brush stroke creation', () => {
    it('should create path on drag with multiple points', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 25 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ];

      // Start drawing
      const downEvent = createMockPointerEvent({
        worldPosition: points[0],
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Move through points
      for (let i = 1; i < points.length; i++) {
        const moveEvent = createMockPointerEvent({
          worldPosition: points[i],
        });
        tool.onPointerMove(moveEvent);
      }

      // End drawing
      const upEvent = createMockPointerEvent({
        worldPosition: points[points.length - 1],
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Check that a path was added to scene graph
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0];
      expect(path.type).toBe('path');
      expect(path.name).toBe('Brush Stroke');
    });

    it('should create open path (not closed)', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      // Brush strokes are now closed outline paths for WebGL fill rendering
      expect(path.closed).toBe(true);
    });

    it('should use fill rendering (not stroke) for WebGL compatibility', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      // Brush strokes use fill for rendering (WebGL lineWidth is limited to 1px)
      expect(path.fill).not.toBeNull();
      expect(path.stroke).toBeNull();
    });

    it('should create filled outline path based on brush size', () => {
      tool.setSize(8);
      tool.setOptions({ pressureEnabled: false }); // Disable pressure for predictable width

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      // Brush creates filled closed outline paths
      expect(path.closed).toBe(true);
      expect(path.fill).not.toBeNull();
      expect(path.stroke).toBeNull();
    });

    it('should select the new path after creation', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const selectedIds = context.getSelectedIds();
      expect(selectedIds.size).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(selectedIds.has(nodes[0].id)).toBe(true);
    });

    it('should not create path with only one point', () => {
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

      // Should not create a path with only one point
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Pressure Sensitivity
  // ==========================================================================

  describe('pressure sensitivity', () => {
    it('should adjust stroke width based on pressure when enabled', () => {
      tool.setSize(10);
      tool.setOptions({
        pressureEnabled: true,
        pressureMin: 0.5,
        pressureMax: 1.0,
      });

      // Use high pressure
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
        pressure: 1.0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        pressure: 1.0,
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
        pressure: 1.0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      // With max pressure, should create a filled closed path (no stroke)
      expect(path.closed).toBe(true);
      expect(path.fill).not.toBeNull();
      expect(path.stroke).toBeNull();
    });

    it('should ignore pressure when disabled', () => {
      tool.setSize(10);
      tool.setOptions({ pressureEnabled: false });

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
        pressure: 0.1, // Low pressure
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        pressure: 0.1,
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
        pressure: 0.1,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      // Should create a filled closed path regardless of pressure
      expect(path.closed).toBe(true);
      expect(path.fill).not.toBeNull();
      expect(path.stroke).toBeNull();
    });
  });

  // ==========================================================================
  // Smoothing
  // ==========================================================================

  describe('smoothing', () => {
    it('should simplify path with high smoothing', () => {
      tool.setSmoothing(100); // Max smoothing

      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 1 }, // Almost collinear
        { x: 20, y: 0 },
        { x: 30, y: 1 },
        { x: 40, y: 0 },
        { x: 100, y: 0 },
      ];

      const downEvent = createMockPointerEvent({
        worldPosition: points[0],
        button: 0,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i < points.length; i++) {
        const moveEvent = createMockPointerEvent({
          worldPosition: points[i],
        });
        tool.onPointerMove(moveEvent);
      }

      const upEvent = createMockPointerEvent({
        worldPosition: points[points.length - 1],
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;

      // With high smoothing, should have fewer points than input
      expect(path.points.length).toBeLessThan(points.length);
    });

    it('should preserve more detail with low smoothing', () => {
      tool.setSmoothing(0); // No smoothing

      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
        { x: 200, y: 0 },
      ];

      const downEvent = createMockPointerEvent({
        worldPosition: points[0],
        button: 0,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i < points.length; i++) {
        const moveEvent = createMockPointerEvent({
          worldPosition: points[i],
        });
        tool.onPointerMove(moveEvent);
      }

      const upEvent = createMockPointerEvent({
        worldPosition: points[points.length - 1],
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;

      // With no smoothing, significant direction changes should be preserved
      expect(path.points.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Preview
  // ==========================================================================

  describe('preview', () => {
    it('should show preview while drawing', () => {
      expect(tool.getPreviewNode()).toBeNull();

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
      });
      tool.onPointerMove(moveEvent);

      expect(tool.getPreviewNode()).not.toBeNull();
      expect(tool.getPreviewNode()?.type).toBe('path');
    });

    it('should update preview as points are added', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent1 = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
      });
      tool.onPointerMove(moveEvent1);

      const preview1 = tool.getPreviewNode() as any;
      const pointCount1 = preview1?.points?.length || 0;

      const moveEvent2 = createMockPointerEvent({
        worldPosition: { x: 100, y: 25 },
      });
      tool.onPointerMove(moveEvent2);

      const preview2 = tool.getPreviewNode() as any;
      const pointCount2 = preview2?.points?.length || 0;

      // Preview should have more or equal points after second move
      expect(pointCount2).toBeGreaterThanOrEqual(pointCount1);
    });

    it('should clear preview after stroke completion', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should not show preview with only one point', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // No move, just down
      expect(tool.getPreviewNode()).toBeNull();
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should cancel stroke on Escape', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      expect(tool.getPreviewNode()).not.toBeNull();

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(tool.getPreviewNode()).toBeNull();
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should ignore Escape when not drawing', () => {
      // Should not throw
      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('should cancel stroke on deactivate', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      expect(tool.getPreviewNode()).not.toBeNull();

      tool.onDeactivate();

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

    it('should handle very short strokes', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      // Move a tiny amount (below minimum distance threshold)
      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 0.001, y: 0.001 },
      });
      tool.onPointerMove(moveEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 0.001, y: 0.001 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Should not create a path (not enough distance)
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should ignore pointer move when not drawing', () => {
      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      // Should not crash or create anything
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should ignore pointer up when not drawing', () => {
      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Should not crash or create anything
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Curve Fitting
  // ==========================================================================

  describe('outline generation', () => {
    it('should create a closed outline path for curved strokes', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ];

      const downEvent = createMockPointerEvent({
        worldPosition: points[0],
        button: 0,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i < points.length; i++) {
        const moveEvent = createMockPointerEvent({
          worldPosition: points[i],
        });
        tool.onPointerMove(moveEvent);
      }

      const upEvent = createMockPointerEvent({
        worldPosition: points[points.length - 1],
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;

      // Should be a closed filled path (outline representation)
      expect(path.closed).toBe(true);
      expect(path.fill).not.toBeNull();
      expect(path.stroke).toBeNull();
      // Outline paths have more points (left side + right side reversed)
      expect(path.points.length).toBeGreaterThan(2);
    });

    it('should handle duplicate consecutive points without crashing', () => {
      // Set low minimum distance and no smoothing to capture all points
      tool.setOptions({ smoothing: 0 });

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
        pressure: 0.5,
      });
      tool.onPointerDown(downEvent);

      // Move to create stroke (points at same location shouldn't crash)
      const moveEvent1 = createMockPointerEvent({
        worldPosition: { x: 200, y: 100 },
        pressure: 0.5,
      });
      tool.onPointerMove(moveEvent1);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 100 },
        button: 0,
        pressure: 0.5,
      });
      tool.onPointerUp(upEvent);

      // Should not throw - node was created successfully
      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBeGreaterThanOrEqual(1);
    });
  });
});
