/**
 * Tests for PolygonTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolygonTool } from './PolygonTool';
import type { ToolContext } from './BaseTool';
import type { PolygonNode } from '@quar/types';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

describe('PolygonTool', () => {
  let context: ToolContext;
  let tool: PolygonTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new PolygonTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('polygon');
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
      expect(options.sides).toBe(5);
      expect(options.innerRadiusRatio).toBe(0.5);
      expect(options.isStarMode).toBe(false);
    });

    it('should allow setting sides', () => {
      tool.setSides(6);
      expect(tool.getOptions().sides).toBe(6);
    });

    it('should clamp sides to minimum 3', () => {
      tool.setSides(2);
      expect(tool.getOptions().sides).toBe(3);
    });

    it('should clamp sides to maximum 12', () => {
      tool.setSides(20);
      expect(tool.getOptions().sides).toBe(12);
    });

    it('should floor fractional sides', () => {
      tool.setSides(5.7);
      expect(tool.getOptions().sides).toBe(5);
    });

    it('should allow setting inner radius ratio', () => {
      tool.setInnerRadiusRatio(0.3);
      expect(tool.getOptions().innerRadiusRatio).toBe(0.3);
    });

    it('should clamp inner radius ratio to minimum 0.1', () => {
      tool.setInnerRadiusRatio(0);
      expect(tool.getOptions().innerRadiusRatio).toBe(0.1);
    });

    it('should clamp inner radius ratio to maximum 0.9', () => {
      tool.setInnerRadiusRatio(1);
      expect(tool.getOptions().innerRadiusRatio).toBe(0.9);
    });

    it('should allow toggling star mode', () => {
      expect(tool.getOptions().isStarMode).toBe(false);
      tool.setStarMode(true);
      expect(tool.getOptions().isStarMode).toBe(true);
      tool.setStarMode(false);
      expect(tool.getOptions().isStarMode).toBe(false);
    });

    it('should allow setting multiple options at once', () => {
      tool.setOptions({
        sides: 8,
        innerRadiusRatio: 0.4,
        isStarMode: true,
      });
      const options = tool.getOptions();
      expect(options.sides).toBe(8);
      expect(options.innerRadiusRatio).toBe(0.4);
      expect(options.isStarMode).toBe(true);
    });

    it('should return a copy of options (immutable)', () => {
      const options1 = tool.getOptions();
      const options2 = tool.getOptions();
      expect(options1).not.toBe(options2);
      expect(options1).toEqual(options2);
    });
  });

  // ==========================================================================
  // Polygon Creation
  // ==========================================================================

  describe('polygon creation', () => {
    it('should create polygon on drag', () => {
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

      expect(context.sceneGraph.getNodeCount()).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.type).toBe('polygon');
    });

    it('should create polygon with correct radius (inscribed in bounding box)', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 80 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      // Radius is half of smaller dimension
      expect(polygon.radius).toBe(40); // min(100, 80) / 2
    });

    it('should create polygon centered in bounding box', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 10, y: 20 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 110, y: 120 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.transform.position.x).toBe(60); // 10 + 100/2
      expect(polygon.transform.position.y).toBe(70); // 20 + 100/2
    });

    it('should use configured number of sides', () => {
      tool.setSides(6);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.sides).toBe(6);
    });

    it('should create triangle with 3 sides', () => {
      tool.setSides(3);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.sides).toBe(3);
      expect(polygon.name).toBe('Polygon');
    });

    it('should create pentagon with 5 sides', () => {
      tool.setSides(5);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.sides).toBe(5);
    });

    it('should create hexagon with 6 sides', () => {
      tool.setSides(6);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.sides).toBe(6);
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
      const polygon = nodes[0] as PolygonNode;
      // Center stays at start point
      expect(polygon.transform.position.x).toBe(50);
      expect(polygon.transform.position.y).toBe(50);
      // Radius is distance from center to end point
      const dx = 100 - 50;
      const dy = 80 - 50;
      const expectedRadius = Math.sqrt(dx * dx + dy * dy);
      expect(polygon.radius).toBeCloseTo(expectedRadius, 5);
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

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should select the new polygon after creation', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

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

    it('should apply default fill', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.fill).toEqual(context.defaultFill);
    });

    it('should apply default stroke', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.stroke).toEqual(context.defaultStroke);
    });
  });

  // ==========================================================================
  // Star Creation
  // ==========================================================================

  describe('star creation', () => {
    beforeEach(() => {
      tool.setStarMode(true);
    });

    it('should create star shape with inner radius', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const star = nodes[0] as PolygonNode;
      expect(star.type).toBe('polygon');
      expect(star.innerRadius).toBeDefined();
    });

    it('should name star shapes correctly', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const star = nodes[0] as PolygonNode;
      expect(star.name).toBe('Star');
    });

    it('should use configured inner radius ratio', () => {
      tool.setInnerRadiusRatio(0.3);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const star = nodes[0] as PolygonNode;
      expect(star.innerRadius).toBeCloseTo(star.radius * 0.3, 5);
    });

    it('should create 5-pointed star by default', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const star = nodes[0] as PolygonNode;
      expect(star.sides).toBe(5);
    });

    it('should create 6-pointed star', () => {
      tool.setSides(6);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const star = nodes[0] as PolygonNode;
      expect(star.sides).toBe(6);
      expect(star.innerRadius).toBeDefined();
    });

    it('should draw star from center when alt is held', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        altKey: true,
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const star = nodes[0] as PolygonNode;
      expect(star.transform.position.x).toBe(50);
      expect(star.transform.position.y).toBe(50);
      expect(star.radius).toBe(50); // Distance from center to end
    });

    it('should not have inner radius when star mode is off', () => {
      tool.setStarMode(false);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.innerRadius).toBeUndefined();
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
      expect(tool.getPreviewNode()?.type).toBe('polygon');
    });

    it('should update preview on move', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const preview = tool.getPreviewNode();
      expect(preview?.radius).toBe(50); // min(100, 100) / 2
    });

    it('should update preview position on move', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const preview = tool.getPreviewNode();
      expect(preview?.transform.position.x).toBe(50);
      expect(preview?.transform.position.y).toBe(50);
    });

    it('should update preview inner radius for stars', () => {
      tool.setStarMode(true);
      tool.setInnerRadiusRatio(0.4);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      const preview = tool.getPreviewNode();
      expect(preview?.innerRadius).toBeCloseTo(50 * 0.4, 5);
    });

    it('should clear preview after creation', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should reflect sides in preview', () => {
      tool.setSides(8);

      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const preview = tool.getPreviewNode();
      expect(preview?.sides).toBe(8);
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

    it('should not cancel when Escape pressed outside drag', () => {
      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);
      // Should not throw or cause issues
      expect(tool.getPreviewNode()).toBeNull();
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
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.radius).toBe(50);
      expect(polygon.transform.position.x).toBe(50);
      expect(polygon.transform.position.y).toBe(50);
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

      // Should not create polygon
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should handle pointer up without pointer down', () => {
      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      // Should not throw and should not create anything
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should handle pointer move without pointer down', () => {
      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
      });
      tool.onPointerMove(moveEvent);

      // Should not throw
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should handle rectangular drag (wider than tall)', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 200, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      // Should use smaller dimension
      expect(polygon.radius).toBe(50); // min(200, 100) / 2
    });

    it('should handle rectangular drag (taller than wide)', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 80, y: 200 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      // Should use smaller dimension
      expect(polygon.radius).toBe(40); // min(80, 200) / 2
    });
  });

  // ==========================================================================
  // Node Properties
  // ==========================================================================

  describe('node properties', () => {
    it('should have correct default opacity', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.opacity).toBe(1);
    });

    it('should have correct default blend mode', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.blendMode).toBe('normal');
    });

    it('should be visible by default', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.visible).toBe(true);
    });

    it('should not be locked by default', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.locked).toBe(false);
    });

    it('should have no parent by default', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.parent).toBeNull();
    });

    it('should have no children by default', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.children).toEqual([]);
    });

    it('should have centered anchor', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const upEvent = createMockPointerEvent({
        worldPosition: { x: 100, y: 100 },
        button: 0,
      });
      tool.onPointerUp(upEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const polygon = nodes[0] as PolygonNode;
      expect(polygon.transform.anchor.x).toBe(0.5);
      expect(polygon.transform.anchor.y).toBe(0.5);
    });

    it('should generate unique IDs', () => {
      // Create first polygon
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      // Create second polygon
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 200 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 300, y: 300 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes[0].id).not.toBe(nodes[1].id);
    });
  });
});
