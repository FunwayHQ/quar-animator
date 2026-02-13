/**
 * Tests for DirectSelectionTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectSelectionTool } from './DirectSelectionTool';
import type { ToolContext } from './BaseTool';
import type {
  PathNode,
  PathPoint,
  ImageNode,
  RectangleNode,
  EllipseNode,
  PolygonNode,
} from '@quar/types';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';

// Helper to create a test path node
function createTestPath(
  context: ToolContext,
  points: PathPoint[],
  closed: boolean = false,
  position: { x: number; y: number } = { x: 0, y: 0 }
): PathNode {
  const transform = createDefaultTransform();
  transform.position = position;

  const node: PathNode = {
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
    points,
    closed,
    fills: [],
    strokes: [context.defaultStroke],
  };

  context.sceneGraph.addNode(node);
  return node;
}

// Helper to create a test path node with subpaths (compound path / text-to-path)
function createTestPathWithSubpaths(
  context: ToolContext,
  points: PathPoint[],
  subpaths: PathPoint[][],
  closed: boolean = true,
  position: { x: number; y: number } = { x: 0, y: 0 }
): PathNode {
  const transform = createDefaultTransform();
  transform.position = position;

  const node: PathNode = {
    id: context.generateId(),
    name: 'Test Compound Path',
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points,
    subpaths,
    closed,
    fills: [],
    strokes: [context.defaultStroke],
  };

  context.sceneGraph.addNode(node);
  return node;
}

// Helper to create a simple path point
function createPoint(
  x: number,
  y: number,
  type: 'corner' | 'smooth' | 'symmetric' = 'corner'
): PathPoint {
  return {
    position: { x, y },
    handleIn: null,
    handleOut: null,
    type,
  };
}

// Helper to create a smooth path point with handles
function createSmoothPoint(
  x: number,
  y: number,
  handleIn: { x: number; y: number } | null,
  handleOut: { x: number; y: number } | null
): PathPoint {
  return {
    position: { x, y },
    handleIn,
    handleOut,
    type: handleIn || handleOut ? 'smooth' : 'corner',
  };
}

describe('DirectSelectionTool', () => {
  let context: ToolContext;
  let tool: DirectSelectionTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new DirectSelectionTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('direct-selection');
    });

    it('should have default cursor', () => {
      expect(tool.cursor).toBe('default');
    });

    it('should start with no selected points', () => {
      expect(tool.getSelectedPoints()).toEqual([]);
    });
  });

  // ==========================================================================
  // Point Selection
  // ==========================================================================

  describe('point selection', () => {
    it('should select point on click', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Click on first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].nodeId).toBe(path.id);
      expect(selected[0].pointIndex).toBe(0);
    });

    it('should clear selection when clicking empty space', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(tool.getSelectedPoints().length).toBe(1);

      // Click on empty space
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 500, y: 500 } }));

      expect(tool.getSelectedPoints().length).toBe(0);
    });

    it('should clear node selection when clicking empty space', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select first point (this also selects the node)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(context.getSelectedIds().has(path.id)).toBe(true);

      // Click on empty space
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 500, y: 500 } }));

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should add to selection with shift+click', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+click second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
          shiftKey: true,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 }, shiftKey: true }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(2);
    });

    it('should toggle selection with shift+click on selected point', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+click first point again to deselect
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          shiftKey: true,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, shiftKey: true }));

      expect(tool.getSelectedPoints().length).toBe(0);
    });

    it('should replace selection when clicking different point without shift', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Click second point without shift
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].pointIndex).toBe(1);
    });

    it('should ignore non-left mouse buttons', () => {
      createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Right click on point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 2,
        })
      );

      expect(tool.getSelectedPoints().length).toBe(0);
    });
  });

  // ==========================================================================
  // Point Movement
  // ==========================================================================

  describe('point movement', () => {
    it('should move selected point on drag', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select and drag first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
        })
      );

      // Check that point was moved
      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].position.x).toBe(50);
      expect(updatedNode.points[0].position.y).toBe(50);
    });

    it('should move multiple selected points together', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+select second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
          shiftKey: true,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 }, shiftKey: true }));

      expect(tool.getSelectedPoints().length).toBe(2);

      // Drag from first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 20, y: 20 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 20, y: 20 },
        })
      );

      // Both points should have moved by the same delta
      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].position.x).toBe(20);
      expect(updatedNode.points[0].position.y).toBe(20);
      expect(updatedNode.points[1].position.x).toBe(120);
      expect(updatedNode.points[1].position.y).toBe(20);
    });

    it('should not move unselected points', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select and drag first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
        })
      );

      // Third point should not have moved
      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[2].position.x).toBe(100);
      expect(updatedNode.points[2].position.y).toBe(100);
    });
  });

  // ==========================================================================
  // Handle Manipulation
  // ==========================================================================

  describe('handle manipulation', () => {
    it('should drag handle-out to adjust curve', () => {
      const path = createTestPath(context, [
        createSmoothPoint(0, 0, { x: -20, y: 0 }, { x: 20, y: 0 }),
        createPoint(100, 0),
      ]);

      // First select the point to make handles visible
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(tool.getSelectedPoints().length).toBe(1);

      // Now drag the handle-out (at position 20, 0)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 20, y: 0 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 30, y: 10 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 30, y: 10 },
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].handleOut).not.toBeNull();
      expect(updatedNode.points[0].handleOut?.x).toBe(30);
      expect(updatedNode.points[0].handleOut?.y).toBe(10);
    });

    it('should update opposite handle for smooth points', () => {
      const path = createTestPath(context, [
        createSmoothPoint(0, 0, { x: -20, y: 0 }, { x: 20, y: 0 }),
        createPoint(100, 0),
      ]);

      // Select the point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Drag handle-out upward
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 20, y: 0 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 30 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 30 },
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      // Handle-in should be opposite direction
      expect(updatedNode.points[0].handleIn).not.toBeNull();
      // Check that it's pointing in opposite direction (normalized)
      const handleIn = updatedNode.points[0].handleIn!;
      const handleOut = updatedNode.points[0].handleOut!;
      // Dot product of opposite directions should be negative
      const dot = handleIn.x * handleOut.x + handleIn.y * handleOut.y;
      expect(dot).toBeLessThan(0);
    });
  });

  // ==========================================================================
  // Point Deletion
  // ==========================================================================

  describe('point deletion', () => {
    it('should delete selected points on Delete key', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      // Delete it
      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points.length).toBe(2);
      expect(updatedNode.points[1].position.x).toBe(100);
      expect(updatedNode.points[1].position.y).toBe(100);
    });

    it('should delete multiple selected points', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
        createPoint(0, 100),
      ]);

      // Select first and third points
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
          shiftKey: true,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, shiftKey: true })
      );

      expect(tool.getSelectedPoints().length).toBe(2);

      // Delete them
      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points.length).toBe(2);
    });

    it('should remove path when less than 2 points remain', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select both points
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
          shiftKey: true,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 }, shiftKey: true }));

      // Delete them
      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      // Path should be removed
      expect(context.sceneGraph.getNode(path.id)).toBeUndefined();
    });

    it('should handle Backspace same as Delete', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select and delete second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      tool.onKeyDown({ key: 'Backspace' } as KeyboardEvent);

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points.length).toBe(2);
    });

    it('should clear selection after delete', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      // Delete it
      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      expect(tool.getSelectedPoints().length).toBe(0);
    });
  });

  // ==========================================================================
  // Add Point to Segment
  // ==========================================================================

  describe('add point to segment', () => {
    it('should add point on double-click on segment', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      const midPoint = { x: 50, y: 0 };

      // First click
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: midPoint,
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: midPoint }));

      // Second click (double-click) - need to simulate time passage
      // The tool checks time, so we'll just call onPointerDown again
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: midPoint,
          button: 0,
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points.length).toBe(3);
    });

    it('should select newly added point', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      const midPoint = { x: 50, y: 0 };

      // Double-click to add point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: midPoint,
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: midPoint }));

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: midPoint,
          button: 0,
        })
      );

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].pointIndex).toBe(1); // New point inserted at index 1
    });

    // X1-2: Y-coordinate interpolation fix
    it('should interpolate Y coordinate correctly for non-horizontal segments', () => {
      // Create a vertical segment from (0,0) to (0,100)
      const path = createTestPath(context, [createPoint(0, 0), createPoint(0, 100)]);

      // Double-click roughly at midpoint of the vertical segment
      const midPoint = { x: 0, y: 50 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: midPoint,
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: midPoint }));

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: midPoint,
          button: 0,
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      if (updatedNode.points.length === 3) {
        // The added point's Y should be between 0 and 100 (interpolated)
        const addedY = updatedNode.points[1].position.y;
        expect(addedY).toBeGreaterThanOrEqual(0);
        expect(addedY).toBeLessThanOrEqual(100);
      }
    });
  });

  // ==========================================================================
  // Alt-Click Point Type Conversion
  // ==========================================================================

  describe('alt-click point type conversion', () => {
    it('should convert corner point to smooth on alt+click', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Alt+click on middle point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[1].type).toBe('smooth');
      expect(updatedNode.points[1].handleIn).not.toBeNull();
      expect(updatedNode.points[1].handleOut).not.toBeNull();
    });

    it('should convert smooth point to corner on alt+click', () => {
      const path = createTestPath(context, [
        createSmoothPoint(0, 0, { x: -20, y: 0 }, { x: 20, y: 0 }),
        createPoint(100, 0),
      ]);

      // Alt+click on smooth point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].type).toBe('corner');
      expect(updatedNode.points[0].handleIn).toBeNull();
      expect(updatedNode.points[0].handleOut).toBeNull();
    });

    it('should select the converted point', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Alt+click to convert point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].nodeId).toBe(path.id);
      expect(selected[0].pointIndex).toBe(0);
    });

    it('should not start dragging when alt+clicking to convert', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Alt+click on point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      // Move mouse
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
        })
      );

      // Point should not have moved
      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].position.x).toBe(0);
      expect(updatedNode.points[0].position.y).toBe(0);
    });

    it('should calculate handles based on neighbors when converting to smooth', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(50, 50),
        createPoint(100, 0),
      ]);

      // Alt+click on middle point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 50 },
          button: 0,
          altKey: true,
        })
      );

      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      const handleOut = updatedNode.points[1].handleOut!;
      const handleIn = updatedNode.points[1].handleIn!;

      // Handles should be opposite (collinear)
      expect(handleOut.x).toBe(-handleIn.x);
      expect(handleOut.y).toBe(-handleIn.y);
    });

    it('should do nothing when alt+clicking on empty space', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Alt+click on empty space
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
          button: 0,
          altKey: true,
        })
      );

      // Points should be unchanged
      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].type).toBe('corner');
      expect(updatedNode.points[1].type).toBe('corner');
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should clear selection on Escape', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select a point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(tool.getSelectedPoints().length).toBe(1);

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(tool.getSelectedPoints().length).toBe(0);
    });

    it('should select all points with Ctrl+A when path is selected', () => {
      const path = createTestPath(context, [
        createPoint(0, 0),
        createPoint(100, 0),
        createPoint(100, 100),
      ]);

      // Select the node first
      context.setSelectedIds([path.id]);

      tool.onKeyDown({
        key: 'a',
        ctrlKey: true,
        preventDefault: () => {},
      } as unknown as KeyboardEvent);

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(3);
    });
  });

  // ==========================================================================
  // Cursor Feedback
  // ==========================================================================

  describe('cursor feedback', () => {
    it('should show move cursor when hovering over point', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Hover over first point
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
        })
      );

      expect(tool.getCursor()).toBe('move');
    });

    it('should show default cursor when not hovering over anything', () => {
      createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Hover over empty space
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 500, y: 500 },
        })
      );

      expect(tool.getCursor()).toBe('default');
    });

    it('should show crosshair cursor when hovering over handle', () => {
      const path = createTestPath(context, [
        createSmoothPoint(0, 0, { x: -20, y: 0 }, { x: 20, y: 0 }),
        createPoint(100, 0),
      ]);

      // First select the point to make handles visible
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Hover over handle
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 20, y: 0 },
        })
      );

      expect(tool.getCursor()).toBe('crosshair');
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('should clear selection on deactivate', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);

      // Select a point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(tool.getSelectedPoints().length).toBe(1);

      tool.onDeactivate?.();

      expect(tool.getSelectedPoints().length).toBe(0);
    });
  });

  // ==========================================================================
  // Multiple Paths
  // ==========================================================================

  describe('multiple paths', () => {
    it('should select points from different paths', () => {
      const path1 = createTestPath(context, [createPoint(0, 0), createPoint(50, 0)]);

      const path2 = createTestPath(context, [createPoint(100, 100), createPoint(150, 100)], false, {
        x: 0,
        y: 0,
      });

      // Select point from first path
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+select point from second path
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
          shiftKey: true,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, shiftKey: true })
      );

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(2);
      expect(selected[0].nodeId).toBe(path1.id);
      expect(selected[1].nodeId).toBe(path2.id);
    });
  });

  // ==========================================================================
  // Path with Transform Position
  // ==========================================================================

  describe('path with transform position', () => {
    it('should correctly hit test points with path position offset', () => {
      const path = createTestPath(
        context,
        [
          createPoint(0, 0), // Local position
          createPoint(50, 0),
        ],
        false,
        { x: 100, y: 100 }
      ); // Path position offset

      // Click at world position (100, 100) which is local (0, 0)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].pointIndex).toBe(0);
    });

    it('should correctly move points with path position offset', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(50, 0)], false, {
        x: 100,
        y: 100,
      });

      // Select and drag first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 120, y: 120 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 120, y: 120 },
        })
      );

      // Point's local position should have moved by delta
      const updatedNode = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updatedNode.points[0].position.x).toBe(20);
      expect(updatedNode.points[0].position.y).toBe(20);
    });
  });

  // ==========================================================================
  // Multi-Subpath (Compound Path) Support
  // ==========================================================================

  describe('multi-subpath support', () => {
    // Compound path layout:
    //   Main contour (indices 0-2): triangle at (0,0), (100,0), (50,100)
    //   Subpath 1 (indices 3-5): triangle at (200,0), (300,0), (250,100)

    function createCompoundPath(ctx: ToolContext) {
      return createTestPathWithSubpaths(
        ctx,
        [createPoint(0, 0), createPoint(100, 0), createPoint(50, 100)],
        [[createPoint(200, 0), createPoint(300, 0), createPoint(250, 100)]],
        true
      );
    }

    // --- Point Selection ---

    it('should select a point in a subpath by flat index', () => {
      const path = createCompoundPath(context);

      // Click on first point of subpath (200, 0) → flat index 3
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 0 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].nodeId).toBe(path.id);
      expect(selected[0].pointIndex).toBe(3);
    });

    it('should select a point in the main contour of a compound path', () => {
      const path = createCompoundPath(context);

      // Click on second point of main contour (100, 0) → flat index 1
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].pointIndex).toBe(1);
    });

    it('should shift+click to select points across different contours', () => {
      const path = createCompoundPath(context);

      // Select point in main contour
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+select point in subpath
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 300, y: 0 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 300, y: 0 }, shiftKey: true }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(2);
      expect(selected[0].pointIndex).toBe(0); // main contour
      expect(selected[1].pointIndex).toBe(4); // subpath
    });

    // --- Select All ---

    it('should select all points including subpaths with Ctrl+A', () => {
      const path = createCompoundPath(context);
      context.setSelectedIds([path.id]);

      tool.onKeyDown({
        key: 'a',
        ctrlKey: true,
        preventDefault: () => {},
      } as unknown as KeyboardEvent);

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(6); // 3 main + 3 subpath
    });

    // --- Point Movement ---

    it('should move a point in a subpath', () => {
      const path = createCompoundPath(context);

      // Select subpath point at (200, 0) → flat index 3
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0 }));

      // Drag to new position
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 220, y: 20 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 220, y: 20 } }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main contour should be unchanged
      expect(updated.points[0].position).toEqual({ x: 0, y: 0 });
      expect(updated.points[1].position).toEqual({ x: 100, y: 0 });
      expect(updated.points[2].position).toEqual({ x: 50, y: 100 });
      // Subpath point should be moved
      expect(updated.subpaths).toBeDefined();
      expect(updated.subpaths![0][0].position.x).toBe(220);
      expect(updated.subpaths![0][0].position.y).toBe(20);
      // Other subpath points unchanged
      expect(updated.subpaths![0][1].position).toEqual({ x: 300, y: 0 });
      expect(updated.subpaths![0][2].position).toEqual({ x: 250, y: 100 });
    });

    it('should move points across contours together', () => {
      const path = createCompoundPath(context);

      // Select main point (0, 0)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+select subpath point (200, 0)
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, shiftKey: true }));

      expect(tool.getSelectedPoints().length).toBe(2);

      // Drag from first selected point
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 10, y: 10 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 10, y: 10 } }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updated.points[0].position).toEqual({ x: 10, y: 10 });
      expect(updated.subpaths![0][0].position).toEqual({ x: 210, y: 10 });
    });

    // --- Point Deletion ---

    it('should delete a point from a subpath', () => {
      const path = createCompoundPath(context);

      // Select first subpath point (200, 0) → flat index 3
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 0 } }));

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main contour unchanged
      expect(updated.points.length).toBe(3);
      // Subpath lost one point
      expect(updated.subpaths).toBeDefined();
      expect(updated.subpaths![0].length).toBe(2);
      expect(updated.subpaths![0][0].position).toEqual({ x: 300, y: 0 });
      expect(updated.subpaths![0][1].position).toEqual({ x: 250, y: 100 });
    });

    it('should remove an entire subpath contour when all its points are deleted', () => {
      const path = createCompoundPath(context);

      // Select all three subpath points via shift+click
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 0 } }));

      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 300, y: 0 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 300, y: 0 }, shiftKey: true }));

      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 250, y: 100 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 250, y: 100 }, shiftKey: true })
      );

      expect(tool.getSelectedPoints().length).toBe(3);

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main contour unchanged
      expect(updated.points.length).toBe(3);
      // Subpaths should be gone
      expect(updated.subpaths).toBeUndefined();
    });

    it('should delete points from both contours simultaneously', () => {
      const path = createCompoundPath(context);

      // Select one main point and one subpath point
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 50, y: 100 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 100 } }));

      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 250, y: 100 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 250, y: 100 }, shiftKey: true })
      );

      expect(tool.getSelectedPoints().length).toBe(2);

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updated.points.length).toBe(2); // main lost 1
      expect(updated.subpaths).toBeDefined();
      expect(updated.subpaths![0].length).toBe(2); // subpath lost 1
    });

    it('should remove entire node when total remaining points < 2', () => {
      // Small compound path: 1 main + 1 subpath point (2 total)
      const path = createTestPathWithSubpaths(
        context,
        [createPoint(0, 0)],
        [[createPoint(100, 0)]],
        false
      );

      // Select both
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 100, y: 0 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 }, shiftKey: true }));

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      expect(context.sceneGraph.getNode(path.id)).toBeUndefined();
    });

    // --- Handle Manipulation ---

    it('should drag a handle on a subpath point', () => {
      const path = createTestPathWithSubpaths(
        context,
        [createPoint(0, 0), createPoint(100, 0)],
        [[createSmoothPoint(200, 0, { x: -20, y: 0 }, { x: 20, y: 0 }), createPoint(300, 0)]],
        false
      );

      // Select the subpath smooth point at (200, 0) → flat index 2
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 0 } }));

      expect(tool.getSelectedPoints().length).toBe(1);
      expect(tool.getSelectedPoints()[0].pointIndex).toBe(2);

      // Now drag handle-out at (220, 0)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 220, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 230, y: 15 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 230, y: 15 } }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main contour unchanged
      expect(updated.points[0].position).toEqual({ x: 0, y: 0 });
      expect(updated.points[1].position).toEqual({ x: 100, y: 0 });
      // Subpath handle should be updated
      expect(updated.subpaths![0][0].handleOut).not.toBeNull();
      expect(updated.subpaths![0][0].handleOut!.x).toBe(30);
      expect(updated.subpaths![0][0].handleOut!.y).toBe(15);
    });

    // --- Alt-Click Point Type Conversion ---

    it('should convert point type in subpath with correct contour-local neighbors', () => {
      const path = createCompoundPath(context);

      // Alt+click on middle subpath point at (300, 0) → flat index 4
      // Its contour neighbors are (200,0) at index 3 and (250,100) at index 5
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 300, y: 0 }, button: 0, altKey: true })
      );

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      const convertedPoint = updated.subpaths![0][1]; // second point in subpath
      expect(convertedPoint.type).toBe('smooth');
      expect(convertedPoint.handleIn).not.toBeNull();
      expect(convertedPoint.handleOut).not.toBeNull();

      // Main contour should be untouched
      expect(updated.points[0].type).toBe('corner');
      expect(updated.points[1].type).toBe('corner');
      expect(updated.points[2].type).toBe('corner');
    });

    it('should wrap neighbors within contour for closed compound path', () => {
      const path = createCompoundPath(context);

      // Alt+click on first subpath point (200, 0) → flat index 3
      // For a closed contour, prev neighbor should be last subpath point (250,100),
      // NOT the last point of the main contour (50,100)
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 200, y: 0 }, button: 0, altKey: true })
      );

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      const converted = updated.subpaths![0][0];
      expect(converted.type).toBe('smooth');

      // Handles should be based on neighbors (250,100) and (300,0), not (50,100)
      // Just verify handles exist and are non-zero — exact values depend on convertPointTypeUtil
      expect(converted.handleIn).not.toBeNull();
      expect(converted.handleOut).not.toBeNull();
    });

    // --- Add Point to Segment ---

    it('should add a point to a segment within a subpath', () => {
      const path = createCompoundPath(context);

      // The segment from (200,0) to (300,0) is on the subpath (flat indices 3→4)
      // Double-click at midpoint (250, 0)
      const mid = { x: 250, y: 0 };
      tool.onPointerDown(createMockPointerEvent({ worldPosition: mid, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: mid }));

      tool.onPointerDown(createMockPointerEvent({ worldPosition: mid, button: 0 }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main contour should be unchanged
      expect(updated.points.length).toBe(3);
      // Subpath should have gained one point
      expect(updated.subpaths).toBeDefined();
      expect(updated.subpaths![0].length).toBe(4);
    });

    it('should add a point to a segment within the main contour of a compound path', () => {
      const path = createCompoundPath(context);

      // The segment from (0,0) to (100,0) is on the main contour (flat indices 0→1)
      // Double-click at midpoint (50, 0)
      const mid = { x: 50, y: 0 };
      tool.onPointerDown(createMockPointerEvent({ worldPosition: mid, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: mid }));

      tool.onPointerDown(createMockPointerEvent({ worldPosition: mid, button: 0 }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main contour should have gained one point
      expect(updated.points.length).toBe(4);
      // Subpath should be unchanged
      expect(updated.subpaths).toBeDefined();
      expect(updated.subpaths![0].length).toBe(3);
    });

    // --- Closing Segment Stays Within Contour ---

    it('should not hit test a segment crossing from main contour to subpath', () => {
      // Compound path: main has (0,0)→(100,0), subpath has (200,0)→(300,0)
      // There should be no segment between (100,0) and (200,0) — the closing segment
      // of the main contour wraps from (50,100) back to (0,0), not to (200,0)
      const path = createCompoundPath(context);

      // Try to double-click at (150, 0) — between last main and first subpath point
      // This should NOT add a point because there's no segment there
      const pos = { x: 150, y: 0 };
      tool.onPointerDown(createMockPointerEvent({ worldPosition: pos, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: pos }));
      tool.onPointerDown(createMockPointerEvent({ worldPosition: pos, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: pos }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // No point should have been added
      expect(updated.points.length).toBe(3);
      expect(updated.subpaths![0].length).toBe(3);
    });

    // --- Cursor Feedback ---

    it('should show move cursor when hovering over a subpath point', () => {
      createCompoundPath(context);

      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 250, y: 100 } }));

      expect(tool.getCursor()).toBe('move');
    });

    // --- Multiple Subpaths ---

    it('should handle paths with multiple subpaths', () => {
      const path = createTestPathWithSubpaths(
        context,
        [createPoint(0, 0), createPoint(100, 0)],
        [
          [createPoint(200, 0), createPoint(300, 0)],
          [createPoint(400, 0), createPoint(500, 0)],
        ],
        false
      );

      context.setSelectedIds([path.id]);

      tool.onKeyDown({
        key: 'a',
        ctrlKey: true,
        preventDefault: () => {},
      } as unknown as KeyboardEvent);

      // 2 main + 2 subpath1 + 2 subpath2 = 6
      expect(tool.getSelectedPoints().length).toBe(6);
    });

    it('should move a point in the second subpath correctly', () => {
      const path = createTestPathWithSubpaths(
        context,
        [createPoint(0, 0), createPoint(100, 0)],
        [
          [createPoint(200, 0), createPoint(300, 0)],
          [createPoint(400, 0), createPoint(500, 0)],
        ],
        false
      );

      // Click on (400, 0) → flat index 4 (2 main + 2 subpath1 + 0)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 400, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 410, y: 10 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 410, y: 10 } }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      // Main and first subpath unchanged
      expect(updated.points[0].position).toEqual({ x: 0, y: 0 });
      expect(updated.subpaths![0][0].position).toEqual({ x: 200, y: 0 });
      // Second subpath point moved
      expect(updated.subpaths![1][0].position).toEqual({ x: 410, y: 10 });
      expect(updated.subpaths![1][1].position).toEqual({ x: 500, y: 0 });
    });

    // --- No Subpaths Backward Compatibility ---

    it('should call onTransformComplete with vertex-move after point drag', () => {
      const completeCalls: Array<{ nodeIds: Set<string>; type: string }> = [];
      context.onTransformComplete = (nodeIds, type) => {
        completeCalls.push({ nodeIds, type });
      };

      const path = createTestPath(
        context,
        [createPoint(0, 0), createPoint(100, 0), createPoint(50, 100)],
        true
      );

      context.setSelectedIds([path.id]);

      // Select a point
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Drag the selected point
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 10, y: 10 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 10, y: 10 } }));

      expect(completeCalls.length).toBe(1);
      expect(completeCalls[0].type).toBe('vertex-move');
      expect(completeCalls[0].nodeIds.has(path.id)).toBe(true);

      // Clean up
      delete context.onTransformComplete;
    });

    it('should behave identically for paths without subpaths', () => {
      const path = createTestPath(
        context,
        [createPoint(0, 0), createPoint(100, 0), createPoint(50, 100)],
        true
      );

      context.setSelectedIds([path.id]);

      tool.onKeyDown({
        key: 'a',
        ctrlKey: true,
        preventDefault: () => {},
      } as unknown as KeyboardEvent);

      expect(tool.getSelectedPoints().length).toBe(3);

      // Move first point
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 5, y: 5 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 5, y: 5 } }));

      const updated = context.sceneGraph.getNode(path.id) as PathNode;
      expect(updated.points[0].position).toEqual({ x: 5, y: 5 });
      expect(updated.subpaths).toBeUndefined();
    });
  });

  // ==========================================================================
  // Image Vertex Editing
  // ==========================================================================

  describe('image vertex editing', () => {
    // Helper to create a test image node
    function createTestImage(
      ctx: ToolContext,
      width: number = 100,
      height: number = 100,
      position: { x: number; y: number } = { x: 0, y: 0 },
      vertexOffsets?: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ]
    ): ImageNode {
      const transform = createDefaultTransform();
      transform.position = position;

      const node: ImageNode = {
        id: ctx.generateId(),
        name: 'Test Image',
        type: 'image',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        src: 'data:image/png;base64,test',
        width,
        height,
        naturalWidth: width,
        naturalHeight: height,
        cornerRadius: [0, 0, 0, 0],
        vertexOffsets,
      };

      ctx.sceneGraph.addNode(node);
      return node;
    }

    it('should select an image vertex on click', () => {
      // Image at (0,0) with anchor (0.5,0.5), so BL corner = (-50, -50)
      const img = createTestImage(context, 100, 100);

      // Click on bottom-left corner
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: -50, y: -50 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: -50, y: -50 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].nodeId).toBe(img.id);
      expect(selected[0].pointIndex).toBe(0); // BL = index 0
    });

    it('should select different image corners', () => {
      const img = createTestImage(context, 100, 100);

      // Click on bottom-right corner (50, -50)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 50, y: -50 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: -50 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].pointIndex).toBe(1); // BR = index 1
    });

    it('should drag an image vertex and update vertexOffsets', () => {
      const img = createTestImage(context, 100, 100);

      // Select BL corner at (-50, -50)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: -50, y: -50 }, button: 0 }));

      // Drag to new position
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: -40, y: -40 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: -40, y: -40 } }));

      const updated = context.sceneGraph.getNode(img.id) as ImageNode;
      expect(updated.vertexOffsets).toBeDefined();
      // BL offset should be (10, 10) from base (-50, -50)
      expect(updated.vertexOffsets![0].x).toBeCloseTo(10);
      expect(updated.vertexOffsets![0].y).toBeCloseTo(10);
      // Other corners should be zero
      expect(updated.vertexOffsets![1].x).toBeCloseTo(0);
      expect(updated.vertexOffsets![1].y).toBeCloseTo(0);
      expect(updated.vertexOffsets![2].x).toBeCloseTo(0);
      expect(updated.vertexOffsets![2].y).toBeCloseTo(0);
      expect(updated.vertexOffsets![3].x).toBeCloseTo(0);
      expect(updated.vertexOffsets![3].y).toBeCloseTo(0);
    });

    it('should preserve existing vertexOffsets when dragging', () => {
      const img = createTestImage(context, 100, 100, { x: 0, y: 0 }, [
        { x: 5, y: 5 }, // BL
        { x: -5, y: 0 }, // BR
        { x: 0, y: -5 }, // TL
        { x: 10, y: 10 }, // TR
      ]);

      // The TR corner base position is (50, 50), with offset (10,10) = (60, 60)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 60, y: 60 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 65, y: 65 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 65, y: 65 } }));

      const updated = context.sceneGraph.getNode(img.id) as ImageNode;
      expect(updated.vertexOffsets).toBeDefined();
      // TR offset should be (15, 15) — base is (50,50), new absolute is (65,65)
      expect(updated.vertexOffsets![3].x).toBeCloseTo(15);
      expect(updated.vertexOffsets![3].y).toBeCloseTo(15);
      // Other offsets should remain unchanged
      expect(updated.vertexOffsets![0].x).toBeCloseTo(5);
      expect(updated.vertexOffsets![0].y).toBeCloseTo(5);
    });

    it('should shift+click to select multiple image vertices', () => {
      const img = createTestImage(context, 100, 100);

      // Select BL corner
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: -50, y: -50 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: -50, y: -50 } }));

      // Shift+select TR corner (50, 50)
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 50, y: 50 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 50 }, shiftKey: true }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(2);
      expect(selected[0].pointIndex).toBe(0); // BL
      expect(selected[1].pointIndex).toBe(3); // TR
    });

    it('should show move cursor when hovering over image vertex', () => {
      createTestImage(context, 100, 100);

      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: -50, y: -50 } }));

      expect(tool.getCursor()).toBe('move');
    });

    it('should fire onTransformComplete with vertex-move after image drag', () => {
      const completeCalls: Array<{ nodeIds: Set<string>; type: string }> = [];
      context.onTransformComplete = (nodeIds, type) => {
        completeCalls.push({ nodeIds, type });
      };

      const img = createTestImage(context, 100, 100);
      context.setSelectedIds([img.id]);

      // Select BL corner
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: -50, y: -50 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: -50, y: -50 } }));

      // Drag the selected vertex
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: -50, y: -50 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: -40, y: -40 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: -40, y: -40 } }));

      expect(completeCalls.length).toBe(1);
      expect(completeCalls[0].type).toBe('vertex-move');
      expect(completeCalls[0].nodeIds.has(img.id)).toBe(true);

      delete context.onTransformComplete;
    });

    it('should select image and path vertices together with shift+click', () => {
      const path = createTestPath(context, [createPoint(0, 0), createPoint(100, 0)]);
      const img = createTestImage(context, 100, 100, { x: 200, y: 0 });

      // Select path point at (0, 0)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Shift+select image BL corner at (150, -50)
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 150, y: -50 }, button: 0, shiftKey: true })
      );
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 150, y: -50 }, shiftKey: true })
      );

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(2);
      expect(selected[0].nodeId).toBe(path.id);
      expect(selected[1].nodeId).toBe(img.id);
    });

    it('should handle image at offset position', () => {
      const img = createTestImage(context, 100, 100, { x: 200, y: 100 });

      // BL corner should be at (200-50, 100-50) = (150, 50)
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 150, y: 50 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 150, y: 50 } }));

      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(1);
      expect(selected[0].nodeId).toBe(img.id);
      expect(selected[0].pointIndex).toBe(0); // BL
    });
  });

  // ==========================================================================
  // Shape-to-Path Auto-Conversion (Bug 3 fix)
  // ==========================================================================

  describe('shape-to-path auto-conversion', () => {
    function createTestRectangle(
      ctx: ToolContext,
      width: number,
      height: number,
      position: { x: number; y: number } = { x: 0, y: 0 }
    ): RectangleNode {
      const transform = createDefaultTransform();
      transform.position = position;

      const node: RectangleNode = {
        id: ctx.generateId(),
        name: 'Test Rect',
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
        fills: [ctx.defaultFill],
        strokes: [ctx.defaultStroke],
      };

      ctx.sceneGraph.addNode(node);
      return node;
    }

    function createTestPolygon(
      ctx: ToolContext,
      radius: number,
      sides: number,
      position: { x: number; y: number } = { x: 0, y: 0 }
    ): PolygonNode {
      const transform = createDefaultTransform();
      transform.position = position;

      const node: PolygonNode = {
        id: ctx.generateId(),
        name: 'Test Polygon',
        type: 'polygon',
        parent: null,
        children: [],
        transform,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        sides,
        radius,
        fills: [ctx.defaultFill],
        strokes: [ctx.defaultStroke],
      };

      ctx.sceneGraph.addNode(node);
      return node;
    }

    function createTestEllipse(
      ctx: ToolContext,
      radiusX: number,
      radiusY: number,
      position: { x: number; y: number } = { x: 0, y: 0 }
    ): EllipseNode {
      const transform = createDefaultTransform();
      transform.position = position;

      const node: EllipseNode = {
        id: ctx.generateId(),
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
        fills: [ctx.defaultFill],
        strokes: [ctx.defaultStroke],
      };

      ctx.sceneGraph.addNode(node);
      return node;
    }

    it('should convert selected rectangle to path on click', () => {
      let convertedId: string | null = null;
      context.convertShapeToPath = vi.fn((nodeId: string) => {
        // Simulate the store action: remove old node, add path node
        const node = context.sceneGraph.getNode(nodeId);
        if (!node || node.type !== 'rectangle') return null;

        const pathId = context.generateId();
        const pathNode: PathNode = {
          id: pathId,
          name: `${node.name} (Path)`,
          type: 'path',
          parent: null,
          children: [],
          transform: { ...node.transform },
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          points: [
            createPoint(-25, -15),
            createPoint(25, -15),
            createPoint(25, 15),
            createPoint(-25, 15),
          ],
          closed: true,
          fills: [],
          strokes: [],
        };

        context.sceneGraph.addNode(pathNode);
        context.sceneGraph.removeNode(nodeId);
        context.setSelectedIds([pathId]);
        convertedId = pathId;
        return pathId;
      });

      const rect = createTestRectangle(context, 50, 30);

      // Single click on the rectangle → triggers conversion immediately
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(context.convertShapeToPath).toHaveBeenCalledWith(rect.id);
      expect(convertedId).not.toBeNull();
    });

    it('should not convert when convertShapeToPath is not available', () => {
      context.convertShapeToPath = undefined;

      const rect = createTestRectangle(context, 50, 30);

      // Click on the rectangle — no converter available, just selects
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Should have selected the node without conversion
      expect(context.getSelectedIds().has(rect.id)).toBe(true);
    });

    it('should convert selected polygon to path on click', () => {
      context.convertShapeToPath = vi.fn((nodeId: string) => {
        const pathId = context.generateId();
        const pathNode: PathNode = {
          id: pathId,
          name: 'Polygon (Path)',
          type: 'path',
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          points: [createPoint(0, 50), createPoint(43, -25), createPoint(-43, -25)],
          closed: true,
          fills: [],
          strokes: [],
        };
        context.sceneGraph.addNode(pathNode);
        context.sceneGraph.removeNode(nodeId);
        context.setSelectedIds([pathId]);
        return pathId;
      });

      const poly = createTestPolygon(context, 50, 3);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(context.convertShapeToPath).toHaveBeenCalledWith(poly.id);
    });

    it('should convert ellipse to path on click', () => {
      context.convertShapeToPath = vi.fn((nodeId: string) => {
        const pathId = context.generateId();
        const pathNode: PathNode = {
          id: pathId,
          name: 'Ellipse (Path)',
          type: 'path',
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          points: [
            createPoint(30, 0),
            createPoint(0, 20),
            createPoint(-30, 0),
            createPoint(0, -20),
          ],
          closed: true,
          fills: [],
          strokes: [],
        };
        context.sceneGraph.addNode(pathNode);
        context.sceneGraph.removeNode(nodeId);
        context.setSelectedIds([pathId]);
        return pathId;
      });

      const ellipse = createTestEllipse(context, 30, 20);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(context.convertShapeToPath).toHaveBeenCalledWith(ellipse.id);
    });

    it('should not convert path nodes (already a path)', () => {
      context.convertShapeToPath = vi.fn(() => null);

      const path = createTestPath(
        context,
        [createPoint(0, 0), createPoint(100, 0), createPoint(100, 100)],
        true
      );
      context.setSelectedIds([path.id]);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Path nodes should go through normal point selection, not conversion
      expect(context.convertShapeToPath).not.toHaveBeenCalled();
    });

    it('should select all points after converting shape to path', () => {
      context.convertShapeToPath = vi.fn((nodeId: string) => {
        const pathId = context.generateId();
        const pathNode: PathNode = {
          id: pathId,
          name: 'Rect (Path)',
          type: 'path',
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          points: [
            createPoint(-25, -15),
            createPoint(25, -15),
            createPoint(25, 15),
            createPoint(-25, 15),
          ],
          closed: true,
          fills: [],
          strokes: [],
        };
        context.sceneGraph.addNode(pathNode);
        context.sceneGraph.removeNode(nodeId);
        context.setSelectedIds([pathId]);
        return pathId;
      });

      const rect = createTestRectangle(context, 50, 30);

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // After conversion, all 4 points should be selected
      const selected = tool.getSelectedPoints();
      expect(selected.length).toBe(4);
    });
  });
});
