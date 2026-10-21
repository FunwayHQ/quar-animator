/**
 * Tests for PenTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PenTool, constrainTo45 } from './PenTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

describe('PenTool', () => {
  let context: ToolContext;
  let tool: PenTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new PenTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('pen');
    });

    it('should have crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });

    it('should not be drawing initially', () => {
      expect(tool.isCurrentlyDrawing()).toBe(false);
    });
  });

  // ==========================================================================
  // Point Creation
  // ==========================================================================

  describe('point creation', () => {
    it('should create corner point on click', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);
      tool.onPointerUp(downEvent);

      expect(tool.isCurrentlyDrawing()).toBe(true);
      expect(tool.getCurrentPath().length).toBe(1);
      expect(tool.getCurrentPath()[0].type).toBe('corner');
    });

    it('should create smooth point with handles on drag', () => {
      const downEvent = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      tool.onPointerDown(downEvent);

      const moveEvent = createMockPointerEvent({
        worldPosition: { x: 50, y: 0 },
      });
      tool.onPointerMove(moveEvent);
      tool.onPointerUp(moveEvent);

      const path = tool.getCurrentPath();
      expect(path.length).toBe(1);
      expect(path[0].type).toBe('smooth');
      expect(path[0].handleOut).not.toBeNull();
      expect(path[0].handleIn).not.toBeNull();
    });

    it('should add multiple points', () => {
      // First point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      // Third point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      expect(tool.getCurrentPath().length).toBe(3);
    });
  });

  // ==========================================================================
  // Path Closure
  // ==========================================================================

  describe('path closure', () => {
    it('should close path when clicking near start point', () => {
      // Create triangle points
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 100 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 100 } }));

      // Click near start point to close (within threshold)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 2, y: 2 }, // Close to (0,0)
          button: 0,
        })
      );

      // Path should be finalized
      expect(tool.isCurrentlyDrawing()).toBe(false);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      expect(path.closed).toBe(true);
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should finish open path on Enter', () => {
      // Create two points
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      tool.onKeyDown({ key: 'Enter' } as KeyboardEvent);

      expect(tool.isCurrentlyDrawing()).toBe(false);
      expect(context.sceneGraph.getNodeCount()).toBe(1);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      expect(path.closed).toBe(false);
    });

    it('should cancel path on Escape', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(tool.isCurrentlyDrawing()).toBe(false);
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should remove last point on Backspace', () => {
      // Create two points
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      expect(tool.getCurrentPath().length).toBe(2);

      tool.onKeyDown({ key: 'Backspace' } as KeyboardEvent);

      expect(tool.getCurrentPath().length).toBe(1);
    });

    it('should cancel when removing last remaining point', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onKeyDown({ key: 'Backspace' } as KeyboardEvent);

      expect(tool.isCurrentlyDrawing()).toBe(false);
      expect(tool.getCurrentPath().length).toBe(0);
    });

    it('should handle Delete key same as Backspace', () => {
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      expect(tool.getCurrentPath().length).toBe(1);
    });
  });

  // ==========================================================================
  // Preview
  // ==========================================================================

  describe('preview', () => {
    it('should show preview while drawing', () => {
      expect(tool.getPreviewNode()).toBeNull();

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(tool.getPreviewNode()).not.toBeNull();
      expect(tool.getPreviewNode()?.type).toBe('path');
    });

    it('should clear preview after path is finished', () => {
      // Create two points
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      tool.onKeyDown({ key: 'Enter' } as KeyboardEvent);

      expect(tool.getPreviewNode()).toBeNull();
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('should finalize path when deactivated', () => {
      // Create two points
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      tool.onDeactivate?.();

      expect(tool.isCurrentlyDrawing()).toBe(false);
      expect(context.sceneGraph.getNodeCount()).toBe(1);
    });

    it('should cancel path if less than 2 points when deactivated', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onDeactivate?.();

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Fill/Stroke
  // ==========================================================================

  describe('fill and stroke', () => {
    it('should apply fill to closed path', () => {
      // Create triangle
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 100 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 100 } }));

      // Close the path
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      expect(path.fills[0]).toEqual(context.defaultFill);
    });

    it('should not apply fill to open path', () => {
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      tool.onKeyDown({ key: 'Enter' } as KeyboardEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      expect(path.fills).toHaveLength(0);
    });

    it('should always apply stroke', () => {
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 } }));

      tool.onKeyDown({ key: 'Enter' } as KeyboardEvent);

      const nodes = Array.from(context.sceneGraph.getNodes());
      const path = nodes[0] as any;
      expect(path.strokes[0]).toEqual(context.defaultStroke);
    });
  });

  // ==========================================================================
  // Alt-Click Point Type Conversion
  // ==========================================================================

  describe('alt-click point type conversion', () => {
    it('should convert corner point to smooth on alt+click', () => {
      // Create first point as corner
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      // Create second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      expect(tool.getCurrentPath()[0].type).toBe('corner');

      // Alt+click on first point to convert to smooth
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      const path = tool.getCurrentPath();
      expect(path[0].type).toBe('smooth');
      expect(path[0].handleIn).not.toBeNull();
      expect(path[0].handleOut).not.toBeNull();
    });

    it('should convert smooth point to corner on alt+click', () => {
      // Create first point with handles (drag to make smooth)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 50, y: 0 },
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 0 } }));

      // Create second point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      expect(tool.getCurrentPath()[0].type).toBe('smooth');

      // Alt+click on first point to convert to corner
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      const path = tool.getCurrentPath();
      expect(path[0].type).toBe('corner');
      expect(path[0].handleIn).toBeNull();
      expect(path[0].handleOut).toBeNull();
    });

    it('should not add new point when alt+clicking on existing point', () => {
      // Create two points
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
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 0 } }));

      expect(tool.getCurrentPath().length).toBe(2);

      // Alt+click on first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
          altKey: true,
        })
      );

      // Should still have only 2 points
      expect(tool.getCurrentPath().length).toBe(2);
    });

    it('should add new point when alt+clicking on empty space', () => {
      // Create first point
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(tool.getCurrentPath().length).toBe(1);

      // Alt+click on empty space (not on existing point)
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
          altKey: true,
        })
      );

      // Should add a new point
      expect(tool.getCurrentPath().length).toBe(2);
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

      expect(tool.isCurrentlyDrawing()).toBe(false);
    });

    it('should not finalize path with single point', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      tool.onKeyDown({ key: 'Enter' } as KeyboardEvent);

      // Should still be drawing since only 1 point
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should handle very small handle drag as corner', () => {
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );

      // Move only a tiny bit
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 0.5, y: 0.5 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 0.5, y: 0.5 },
        })
      );

      const path = tool.getCurrentPath();
      expect(path[0].type).toBe('corner');
    });
  });

  // ==========================================================================
  // Degenerate Path Validation
  // ==========================================================================

  describe('degenerate path validation', () => {
    it('should not create a node when all points are at the same location', () => {
      // Click multiple times at the same position
      for (let i = 0; i < 4; i++) {
        tool.onPointerDown(
          createMockPointerEvent({
            worldPosition: { x: 100, y: 100 },
            button: 0,
          })
        );
        tool.onPointerUp(
          createMockPointerEvent({
            worldPosition: { x: 100, y: 100 },
          })
        );
      }

      // Try to finalize with Enter
      tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));

      // No node should be added since bounding box is < 0.1
      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes.length).toBe(0);
      expect(tool.isCurrentlyDrawing()).toBe(false);
    });
  });

  describe('rubber band', () => {
    const click = (x: number, y: number) => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x, y }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x, y }, buttons: 0 }));
    };
    const hover = (x: number, y: number) =>
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x, y }, buttons: 0 }));

    it('is there only while drawing', () => {
      hover(10, 10);
      expect(tool.getRubberBand()).toBeNull();
    });

    it('runs from the last point to the pointer', () => {
      click(0, 0);
      hover(50, 20);
      expect(tool.getRubberBand()).toEqual({ to: { x: 50, y: 20 }, closing: false });
    });

    it('says when a click would close the path', () => {
      click(0, 0);
      click(100, 0);
      click(50, 80);
      hover(3, 2);
      expect(tool.getRubberBand()?.closing).toBe(true);
      hover(30, 30);
      expect(tool.getRubberBand()?.closing).toBe(false);
    });

    it('is hidden while a handle is being dragged out', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 30, y: 0 }, buttons: 1 }));
      expect(tool.getRubberBand()).toBeNull();
    });
  });

  describe('Shift and Alt', () => {
    it('constrainTo45 keeps how far along the nearest 45° line the pointer is', () => {
      expect(constrainTo45({ x: 0, y: 0 }, { x: 100, y: 8 })).toEqual({ x: 100, y: 0 });
      const diagonal = constrainTo45({ x: 0, y: 0 }, { x: 50, y: 60 });
      expect(diagonal.x).toBeCloseTo(diagonal.y);
      expect(diagonal.x).toBeCloseTo(55);
    });

    it('Shift-click places the point on a 45° line from the last, and so does the line to it', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, buttons: 0 }));

      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: { x: 97, y: 6 }, buttons: 0, shiftKey: true })
      );
      expect(tool.getRubberBand()?.to).toEqual({ x: 97, y: 0 });

      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 97, y: 6 }, button: 0, shiftKey: true })
      );
      expect(tool.getCurrentPath()[1]!.position).toEqual({ x: 97, y: 0 });
    });

    it('Shift holds a handle being dragged out to 45°', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: { x: 40, y: 3 }, buttons: 1, shiftKey: true })
      );
      expect(tool.getCurrentPath()[0]!.handleOut).toEqual({ x: 40, y: 0 });
    });

    it('Alt-dragging out a handle leaves the incoming one where it was', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 40, y: 0 }, buttons: 1 }));
      tool.onPointerMove(
        createMockPointerEvent({ worldPosition: { x: 0, y: 40 }, buttons: 1, altKey: true })
      );

      const point = tool.getCurrentPath()[0]!;
      expect(point.handleOut).toEqual({ x: 0, y: 40 });
      expect(point.handleIn).toEqual({ x: -40, y: -0 });
      expect(point.type).toBe('corner');
    });
  });
});
