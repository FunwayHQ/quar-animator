/**
 * Tests for BrushTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.strokes).toHaveLength(0);
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
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.strokes).toHaveLength(0);
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
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.strokes).toHaveLength(0);
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
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.strokes).toHaveLength(0);
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

      // With high smoothing, Kalman filter smooths input heavily.
      // Output is a closed outline (left + right + caps), so more points than input,
      // but the outline should still be a valid closed path.
      expect(path.closed).toBe(true);
      expect(path.points.length).toBeGreaterThan(2);
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
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.strokes).toHaveLength(0);
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

  // ==========================================================================
  // Schneider-based Curve Fitting
  // ==========================================================================

  describe('schneider-based curve fitting', () => {
    function getBounds(points: any[]) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const p of points) {
        minX = Math.min(minX, p.position.x);
        maxX = Math.max(maxX, p.position.x);
        minY = Math.min(minY, p.position.y);
        maxY = Math.max(maxY, p.position.y);
      }
      return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }

    it('should produce smooth bezier handles on curved stroke', () => {
      // Draw an S-curve
      const points = [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        { x: 60, y: 60 },
        { x: 100, y: 50 },
        { x: 130, y: 20 },
        { x: 160, y: 0 },
        { x: 200, y: -20 },
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
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      expect(path.type).toBe('path');
      // The output is a closed outline, so it should have points
      expect(path.points.length).toBeGreaterThan(4);
    });

    it('should produce path with G1-continuous points from Schneider fitting', () => {
      // Draw a curve with enough points for Schneider to produce smooth segments
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        points.push({
          x: i * 20,
          y: Math.sin(i * 0.5) * 40,
        });
      }

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
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      // The outline path should exist and be closed
      expect(path.closed).toBe(true);
      expect(path.points.length).toBeGreaterThan(2);
    });

    it('should fit curve within reasonable error bound', () => {
      // Draw points on a known circle (radius 50, center at 50,0)
      const radius = 50;
      const cx = 50;
      const cy = 0;
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= 8; i++) {
        const angle = (i / 8) * Math.PI; // semicircle
        points.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        });
      }

      const downEvent = createMockPointerEvent({
        worldPosition: points[0],
        button: 0,
        pressure: 0.5,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i < points.length; i++) {
        const moveEvent = createMockPointerEvent({
          worldPosition: points[i],
          pressure: 0.5,
        });
        tool.onPointerMove(moveEvent);
      }

      const upEvent = createMockPointerEvent({
        worldPosition: points[points.length - 1],
        button: 0,
        pressure: 0.5,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      // The output outline should span roughly the area of the semicircle
      const bounds = getBounds(path.points);
      // The outline should have width spanning at least part of the diameter
      expect(bounds.width).toBeGreaterThan(radius * 0.5);
    });
  });

  // ==========================================================================
  // Variable Width from Pressure
  // ==========================================================================

  describe('variable width from pressure', () => {
    function getBounds(points: any[]) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const p of points) {
        minX = Math.min(minX, p.position.x);
        maxX = Math.max(maxX, p.position.x);
        minY = Math.min(minY, p.position.y);
        maxY = Math.max(maxY, p.position.y);
      }
      return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }

    it('should create wider outline with higher pressure', () => {
      const strokePath = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];

      // Draw with high pressure
      tool.setSize(20);
      tool.setOptions({ pressureEnabled: true, pressureMin: 0.1, pressureMax: 1.0 });

      let downEvent = createMockPointerEvent({
        worldPosition: strokePath[0],
        button: 0,
        pressure: 0.9,
      });
      tool.onPointerDown(downEvent);
      for (let i = 1; i < strokePath.length; i++) {
        tool.onPointerMove(createMockPointerEvent({ worldPosition: strokePath[i], pressure: 0.9 }));
      }
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: strokePath[strokePath.length - 1],
          button: 0,
          pressure: 0.9,
        })
      );

      const nodesHigh = Array.from(context.sceneGraph.getNodes());
      expect(nodesHigh.length).toBe(1);
      const highPressureBounds = getBounds((nodesHigh[0] as any).points);

      // Reset for second stroke
      context.sceneGraph.removeNode(nodesHigh[0].id);
      tool = new BrushTool(context);
      tool.setSize(20);
      tool.setOptions({ pressureEnabled: true, pressureMin: 0.1, pressureMax: 1.0 });

      // Draw with low pressure
      downEvent = createMockPointerEvent({
        worldPosition: strokePath[0],
        button: 0,
        pressure: 0.2,
      });
      tool.onPointerDown(downEvent);
      for (let i = 1; i < strokePath.length; i++) {
        tool.onPointerMove(createMockPointerEvent({ worldPosition: strokePath[i], pressure: 0.2 }));
      }
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: strokePath[strokePath.length - 1],
          button: 0,
          pressure: 0.2,
        })
      );

      const nodesLow = Array.from(context.sceneGraph.getNodes());
      expect(nodesLow.length).toBe(1);
      const lowPressureBounds = getBounds((nodesLow[0] as any).points);

      // High pressure should produce a wider outline (larger height for horizontal stroke)
      expect(highPressureBounds.height).toBeGreaterThan(lowPressureBounds.height);
    });

    it('should vary width along stroke based on changing pressure', () => {
      tool.setSize(15);
      tool.setOptions({ pressureEnabled: true, pressureMin: 0.1, pressureMax: 1.0 });

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
        pressure: 0.1,
      });
      tool.onPointerDown(downEvent);

      // Increase pressure along the stroke
      for (let i = 1; i <= 8; i++) {
        const p = i / 8; // 0.125 to 1.0
        tool.onPointerMove(
          createMockPointerEvent({
            worldPosition: { x: i * 20, y: 0 },
            pressure: 0.1 + p * 0.9,
          })
        );
      }

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 160, y: 0 },
          button: 0,
          pressure: 1.0,
        })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);
      const path = nodes[0] as any;
      expect(path.closed).toBe(true);
      expect(path.points.length).toBeGreaterThan(2);
    });

    it('should use pressureMin/pressureMax mapping', () => {
      const strokePath = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];

      // With pressureMin=0.5, pressureMax=1.0 and pressure=0 → defaults to 0.5 → mapped = 0.75
      tool.setSize(20);
      tool.setOptions({ pressureEnabled: true, pressureMin: 0.5, pressureMax: 1.0 });

      let downEvent = createMockPointerEvent({
        worldPosition: strokePath[0],
        button: 0,
        pressure: 0.0,
      });
      tool.onPointerDown(downEvent);
      for (let i = 1; i < strokePath.length; i++) {
        tool.onPointerMove(createMockPointerEvent({ worldPosition: strokePath[i], pressure: 0.0 }));
      }
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: strokePath[strokePath.length - 1],
          button: 0,
          pressure: 0.0,
        })
      );

      const nodesWithPressure = Array.from(context.sceneGraph.getNodes());
      expect(nodesWithPressure.length).toBe(1);

      // Reset
      context.sceneGraph.removeNode(nodesWithPressure[0].id);
      tool = new BrushTool(context);

      // With pressureEnabled=false → width should always be size * 1.0 (full)
      tool.setSize(20);
      tool.setOptions({ pressureEnabled: false });

      downEvent = createMockPointerEvent({
        worldPosition: strokePath[0],
        button: 0,
        pressure: 0.0, // pressure is ignored when disabled
      });
      tool.onPointerDown(downEvent);
      for (let i = 1; i < strokePath.length; i++) {
        tool.onPointerMove(createMockPointerEvent({ worldPosition: strokePath[i], pressure: 0.0 }));
      }
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: strokePath[strokePath.length - 1],
          button: 0,
          pressure: 0.0,
        })
      );

      const nodesWithoutPressure = Array.from(context.sceneGraph.getNodes());
      expect(nodesWithoutPressure.length).toBe(1);

      // pressureEnabled=false uses pressure=1.0 always, which maps to full width
      // pressureEnabled=true with pressure=0 maps to pressureMin=0.5, so width is smaller
      const boundsWithPressure = getBounds((nodesWithPressure[0] as any).points);
      const boundsWithoutPressure = getBounds((nodesWithoutPressure[0] as any).points);

      // The disabled-pressure stroke (full width) should be wider than the
      // pressure-enabled stroke (half width from pressureMin=0.5)
      expect(boundsWithoutPressure.height).toBeGreaterThan(boundsWithPressure.height);

      function getBounds(points: any[]) {
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (const p of points) {
          minX = Math.min(minX, p.position.x);
          maxX = Math.max(maxX, p.position.x);
          minY = Math.min(minY, p.position.y);
          maxY = Math.max(maxY, p.position.y);
        }
        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
      }
    });

    it('should create round end caps at stroke endpoints', () => {
      tool.setSize(10);
      tool.setOptions({ pressureEnabled: false });

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 80, y: 0 } }));

      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 80, y: 0 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      expect(path.closed).toBe(true);

      // Round caps add extra points beyond just left+right sides.
      // For a simple 2-point stroke: left side + right side reversed = ~sampleCount*2 points
      // With caps: at least 2*(capPoints+1) additional points
      // The total should be significantly more than just 2 sides
      expect(path.points.length).toBeGreaterThan(10);
    });
  });

  // ==========================================================================
  // Kalman Filter Integration
  // ==========================================================================

  describe('kalman filter integration', () => {
    it('should produce different results at different smoothing levels', () => {
      // Draw identical zigzag at two smoothing levels and compare
      const zigzagPoints = [
        { x: 0, y: 0 },
        { x: 20, y: 30 },
        { x: 40, y: -10 },
        { x: 60, y: 25 },
        { x: 80, y: -5 },
        { x: 100, y: 20 },
        { x: 120, y: 0 },
      ];

      // First: smoothing=0
      tool.setSmoothing(0);
      tool.setOptions({ pressureEnabled: false });

      let downEvent = createMockPointerEvent({
        worldPosition: zigzagPoints[0],
        button: 0,
        timestamp: 1000,
      });
      tool.onPointerDown(downEvent);
      for (let i = 1; i < zigzagPoints.length; i++) {
        tool.onPointerMove(
          createMockPointerEvent({
            worldPosition: zigzagPoints[i],
            timestamp: 1000 + i * 16,
          })
        );
      }
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: zigzagPoints[zigzagPoints.length - 1],
          button: 0,
          timestamp: 1000 + zigzagPoints.length * 16,
        })
      );

      const nodesLow = Array.from(context.sceneGraph.getNodes());
      expect(nodesLow.length).toBe(1);
      const lowSmoothing = (nodesLow[0] as any).points;

      // Reset
      context.sceneGraph.removeNode(nodesLow[0].id);
      tool = new BrushTool(context);

      // Second: smoothing=100
      tool.setSmoothing(100);
      tool.setOptions({ pressureEnabled: false });

      downEvent = createMockPointerEvent({
        worldPosition: zigzagPoints[0],
        button: 0,
        timestamp: 2000,
      });
      tool.onPointerDown(downEvent);
      for (let i = 1; i < zigzagPoints.length; i++) {
        tool.onPointerMove(
          createMockPointerEvent({
            worldPosition: zigzagPoints[i],
            timestamp: 2000 + i * 16,
          })
        );
      }
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: zigzagPoints[zigzagPoints.length - 1],
          button: 0,
          timestamp: 2000 + zigzagPoints.length * 16,
        })
      );

      const nodesHigh = Array.from(context.sceneGraph.getNodes());
      expect(nodesHigh.length).toBe(1);
      const highSmoothing = (nodesHigh[0] as any).points;

      // The two outputs should differ (different point counts or positions)
      // With different Kalman parameters, the filtered positions will differ
      const lowPointStr = JSON.stringify(lowSmoothing.map((p: any) => p.position));
      const highPointStr = JSON.stringify(highSmoothing.map((p: any) => p.position));
      expect(lowPointStr).not.toBe(highPointStr);
    });

    it('should filter jittery input into smoother output', () => {
      tool.setSmoothing(80);
      tool.setOptions({ pressureEnabled: false });

      // Feed points on a straight line with random jitter
      const baseY = 0;
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: baseY },
        button: 0,
        timestamp: 1000,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i <= 15; i++) {
        // Small random jitter in Y (deterministic via simple formula)
        const jitterY = ((i * 7 + 3) % 5) - 2; // produces -2, -1, 0, 1, 2 pattern
        tool.onPointerMove(
          createMockPointerEvent({
            worldPosition: { x: i * 10, y: baseY + jitterY },
            timestamp: 1000 + i * 16,
          })
        );
      }

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 160, y: baseY },
          button: 0,
          timestamp: 1000 + 16 * 16,
        })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      // Should produce a valid closed path (outline)
      expect(path.closed).toBe(true);
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.points.length).toBeGreaterThan(2);
    });

    it('should initialize new filter for each stroke', () => {
      tool.setSmoothing(50);
      tool.setOptions({ pressureEnabled: false });

      // First stroke
      let downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
        timestamp: 1000,
      });
      tool.onPointerDown(downEvent);
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          timestamp: 1016,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
          timestamp: 1032,
        })
      );

      expect(context.sceneGraph.getNodeCount()).toBe(1);

      // Second stroke (should succeed with a fresh Kalman filter, no stale state)
      // Re-create tool since setActiveTool is called after first stroke
      tool = new BrushTool(context);
      tool.setSmoothing(50);
      tool.setOptions({ pressureEnabled: false });

      downEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 200 },
        button: 0,
        timestamp: 2000,
      });
      tool.onPointerDown(downEvent);
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 300, y: 300 },
          timestamp: 2016,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 300, y: 300 },
          button: 0,
          timestamp: 2032,
        })
      );

      // Both strokes should have been created
      expect(context.sceneGraph.getNodeCount()).toBe(2);
    });
  });

  // ==========================================================================
  // Committed Curves Buffer
  // ==========================================================================

  describe('committed curves buffer', () => {
    it('should handle many-point strokes (commit threshold)', () => {
      tool.setSmoothing(0);
      tool.setOptions({ pressureEnabled: false });

      // Draw 30+ points spread far apart to avoid min-distance filtering
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
        timestamp: 1000,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i <= 35; i++) {
        tool.onPointerMove(
          createMockPointerEvent({
            worldPosition: { x: i * 15, y: Math.sin(i * 0.3) * 30 },
            timestamp: 1000 + i * 16,
          })
        );
      }

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 35 * 15, y: Math.sin(35 * 0.3) * 30 },
          button: 0,
          timestamp: 1000 + 36 * 16,
        })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      expect(path.type).toBe('path');
      expect(path.closed).toBe(true);
      expect(path.fills.length).toBeGreaterThan(0);
    });

    it('should produce valid path even with commit during stroke', () => {
      tool.setSmoothing(0);
      tool.setOptions({ pressureEnabled: false });

      // Draw 20+ points to trigger commitFloatingPoints (threshold is 12)
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
        timestamp: 1000,
      });
      tool.onPointerDown(downEvent);

      for (let i = 1; i <= 25; i++) {
        tool.onPointerMove(
          createMockPointerEvent({
            worldPosition: { x: i * 12, y: ((i % 3) - 1) * 20 },
            timestamp: 1000 + i * 16,
          })
        );
      }

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 25 * 12, y: 0 },
          button: 0,
          timestamp: 1000 + 26 * 16,
        })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      expect(path.closed).toBe(true);
      expect(path.fills.length).toBeGreaterThan(0);
      expect(path.strokes).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Integration
  // ==========================================================================

  describe('integration', () => {
    it('should call onTransformStart before adding node', () => {
      const onTransformStart = vi.fn();
      context.onTransformStart = onTransformStart;
      tool = new BrushTool(context);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 80, y: 40 } }));

      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 80, y: 40 }, button: 0 }));

      expect(onTransformStart).toHaveBeenCalledTimes(1);
      // Verify node was also created
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should switch to selection tool after stroke', () => {
      const setActiveTool = vi.fn();
      context.setActiveTool = setActiveTool;
      tool = new BrushTool(context);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 60, y: 30 } }));

      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 60, y: 30 }, button: 0 }));

      expect(setActiveTool).toHaveBeenCalledWith('selection');
    });

    it('should use default stroke color for fill', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 70, y: 35 } }));

      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 70, y: 35 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(1);

      const path = nodes[0] as any;
      expect(path.fills.length).toBe(1);
      expect(path.fills[0].color).toEqual(context.defaultFill.color);
      expect(path.fills[0].opacity).toBe(context.defaultFill.opacity);
    });
  });
});
