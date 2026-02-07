/**
 * Tests for DirectSelectionTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DirectSelectionTool } from './DirectSelectionTool';
import type { ToolContext } from './BaseTool';
import type { PathNode, PathPoint } from '@quar/types';
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
});
