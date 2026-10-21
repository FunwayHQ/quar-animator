/**
 * Pen Tool for Quar Animator
 * Creates custom bezier paths by clicking and dragging
 */

import type { CanvasPointerEvent, PathNode, PathPoint, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';
import { vec2 } from '../math';
import {
  convertPointType as convertPointTypeUtil,
  updateHandleWithSymmetry,
} from '../path/pointUtils';
import { centerPathNodeGeometry } from '../path/pathUtils';

// ============================================================================
// PenTool Class
// ============================================================================

// Handle drag mode types
type HandleDragMode = 'none' | 'new-point' | 'existing-handle';

/**
 * `to` held to the nearest 45° direction from `from`, as far along it as the
 * pointer is (Shift with the Pen, as in Illustrator).
 */
export function constrainTo45(from: Vector2, to: Vector2): Vector2 {
  const offset = vec2.subtract(to, from);
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(offset.y, offset.x) / step) * step;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const length = vec2.dot(offset, direction);
  return vec2.add(from, vec2.multiply(direction, length));
}

interface HandleDragState {
  mode: HandleDragMode;
  pointIndex: number;
  handleType: 'in' | 'out';
}

export class PenTool extends BaseTool {
  readonly type = 'pen' as const;
  readonly cursor = 'crosshair';

  private currentPath: PathPoint[] = [];
  private isDrawing: boolean = false;
  private isDraggingHandle: boolean = false;
  private previewNode: PathNode | null = null;

  // Handle manipulation state
  private handleDragState: HandleDragState = {
    mode: 'none',
    pointIndex: -1,
    handleType: 'out',
  };

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    const last = this.isDrawing ? this.currentPath[this.currentPath.length - 1] : undefined;
    const worldPos =
      event.shiftKey && last
        ? constrainTo45(last.position, event.worldPosition)
        : { ...event.worldPosition };

    if (!this.isDrawing) {
      // Start new path
      this.isDrawing = true;
      this.currentPath = [];
      this.previewNode = this.createPathNode([]);
    }

    // Alt+click on existing point to convert point type
    if (event.altKey && this.currentPath.length > 0) {
      const hitIndex = this.hitTestCurrentPathPoint(worldPos);
      if (hitIndex !== -1) {
        this.convertPointType(hitIndex);
        return;
      }
    }

    // Check if clicking near the first point to close the path
    if (this.isNearFirstPoint(worldPos)) {
      this.finalizePath(true);
      return;
    }

    // Add new point
    const newPoint: PathPoint = {
      position: worldPos,
      handleIn: null,
      handleOut: null,
      type: 'corner',
    };

    this.currentPath.push(newPoint);
    this.isDraggingHandle = true;
    this.state.startWorldPos = worldPos;

    this.updatePreviewNode();
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isDrawing) return;

    const last = this.currentPath[this.currentPath.length - 1];
    // Shift holds the next segment (or, while dragging one out, the handle) to 45°
    const worldPos =
      event.shiftKey && last && !this.isDraggingHandle
        ? constrainTo45(last.position, event.worldPosition)
        : { ...event.worldPosition };
    this.state.currentWorldPos = worldPos;

    // If mouse button was released (e.g. mouseUp on overlay element), stop dragging
    if (this.isDraggingHandle && event.buttons === 0) {
      this.isDraggingHandle = false;
      this.handleDragState = { mode: 'none', pointIndex: -1, handleType: 'out' };
    }

    if (this.isDraggingHandle && this.currentPath.length > 0) {
      if (this.handleDragState.mode === 'existing-handle') {
        // Dragging an existing handle
        this.updateExistingHandle(worldPos);
      } else {
        // Creating a new point - update handle of the last point
        const lastPoint = this.currentPath[this.currentPath.length - 1]!;
        const target = event.shiftKey
          ? constrainTo45(lastPoint.position, event.worldPosition)
          : worldPos;
        const handleOut = vec2.subtract(target, lastPoint.position);

        // Check if the handle has significant length
        if (vec2.length(handleOut) > 1) {
          lastPoint.handleOut = handleOut;
          if (event.altKey) {
            // Alt breaks the pair: the incoming handle stays where it is
            lastPoint.type = 'corner';
          } else {
            lastPoint.handleIn = { x: -handleOut.x, y: -handleOut.y };
            lastPoint.type = 'smooth';
          }
        }
      }

      this.updatePreviewNode();
    }
  }

  /**
   * Update an existing handle position during drag
   */
  private updateExistingHandle(worldPos: Vector2): void {
    const { pointIndex, handleType } = this.handleDragState;
    const point = this.currentPath[pointIndex];
    if (!point) return;

    const handleOffset = vec2.subtract(worldPos, point.position);
    const updated = updateHandleWithSymmetry(point, handleType, handleOffset);

    // Apply result back to the mutable path array
    this.currentPath[pointIndex] = updated;
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    this.isDraggingHandle = false;
    this.handleDragState = { mode: 'none', pointIndex: -1, handleType: 'out' };
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (!this.isDrawing) return;

    switch (event.key) {
      case 'Escape':
        // Cancel path
        this.cancelPath();
        break;

      case 'Enter':
        // Finalize path (open)
        if (this.currentPath.length >= 2) {
          this.finalizePath(false);
        }
        break;

      case 'Backspace':
      case 'Delete':
        // Remove last point
        if (this.currentPath.length > 0) {
          this.currentPath.pop();
          if (this.currentPath.length === 0) {
            this.cancelPath();
          } else {
            this.updatePreviewNode();
          }
        }
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): PathNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Public Methods
  // --------------------------------------------------------------------------

  /**
   * Check if the pen tool is currently drawing a path
   */
  isCurrentlyDrawing(): boolean {
    return this.isDrawing;
  }

  /**
   * Get the current path points
   */
  getCurrentPath(): PathPoint[] {
    return [...this.currentPath];
  }

  /**
   * The line to the pointer while drawing (from the last point, curving out
   * along its handle), and whether a click there would close the path.
   * Null when not drawing, or while a handle is being dragged out.
   */
  getRubberBand(): { to: Vector2; closing: boolean } | null {
    const to = this.state.currentWorldPos;
    if (!this.isDrawing || this.isDraggingHandle || this.currentPath.length === 0 || !to) {
      return null;
    }
    return { to: { ...to }, closing: this.isNearFirstPoint(to) };
  }

  /** Within reach of the first point of a path that a click there would close. */
  private isNearFirstPoint(pos: Vector2): boolean {
    if (this.currentPath.length <= 2) return false;
    const closeThreshold = 10 / this.context.camera.zoom; // Screen pixels converted to world units
    return vec2.distance(pos, this.currentPath[0]!.position) < closeThreshold;
  }

  /**
   * Start dragging an existing handle (called from UI overlay)
   */
  startHandleDrag(pointIndex: number, handleType: 'in' | 'out'): void {
    if (!this.isDrawing || pointIndex < 0 || pointIndex >= this.currentPath.length) return;

    this.isDraggingHandle = true;
    this.handleDragState = {
      mode: 'existing-handle',
      pointIndex,
      handleType,
    };
  }

  /**
   * Start dragging an existing point (called from UI overlay)
   * Returns true if the path was closed, false otherwise
   */
  startPointDrag(pointIndex: number): boolean {
    if (!this.isDrawing || pointIndex < 0 || pointIndex >= this.currentPath.length) return false;

    // Check if clicking on the first point to close the path
    if (pointIndex === 0 && this.currentPath.length > 2) {
      this.finalizePath(true);
      return true; // Path was closed
    }

    // For other points, clicking adjusts the handleOut
    // This allows re-adjusting handles of previously placed points
    this.isDraggingHandle = true;
    this.handleDragState = {
      mode: 'existing-handle',
      pointIndex,
      handleType: 'out',
    };
    return false;
  }

  /**
   * Move an existing point to a new position (called from UI overlay)
   */
  movePoint(pointIndex: number, worldPos: Vector2): void {
    if (!this.isDrawing || pointIndex < 0 || pointIndex >= this.currentPath.length) return;

    const point = this.currentPath[pointIndex];
    if (point) {
      point.position = { ...worldPos };
      this.updatePreviewNode();
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private finalizePath(closed: boolean): void {
    if (this.currentPath.length < 2) {
      this.cancelPath();
      return;
    }

    // Check for degenerate path (all points at essentially the same location)
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of this.currentPath) {
      if (p.position.x < minX) minX = p.position.x;
      if (p.position.x > maxX) maxX = p.position.x;
      if (p.position.y < minY) minY = p.position.y;
      if (p.position.y > maxY) maxY = p.position.y;
    }
    if (maxX - minX < 0.1 && maxY - minY < 0.1) {
      this.cancelPath();
      return;
    }

    // Create final path node and center geometry for correct rotation pivot
    const node = this.createPathNode(this.currentPath, closed);
    centerPathNodeGeometry(node);

    // Add to scene graph
    this.context.onTransformStart?.();
    this.context.sceneGraph.addNode(node);

    // Reset state BEFORE switching tools to prevent recursive finalizePath
    // (setActiveTool triggers onDeactivate, which would call finalizePath again
    // if isDrawing is still true)
    this.resetPenState();

    // Select the new node
    this.context.setSelectedIds([node.id]);

    // Switch to selection tool
    this.context.setActiveTool('selection');
  }

  private cancelPath(): void {
    this.resetPenState();
  }

  private resetPenState(): void {
    this.currentPath = [];
    this.isDrawing = false;
    this.isDraggingHandle = false;
    this.previewNode = null;
    this.resetState();
  }

  private updatePreviewNode(): void {
    if (this.previewNode) {
      this.previewNode.points = [...this.currentPath];
    }
  }

  /**
   * Hit test points in the current path being drawn
   * @returns Index of hit point, or -1 if no hit
   */
  private hitTestCurrentPathPoint(worldPos: Vector2): number {
    const hitRadius = 10 / this.context.camera.zoom;

    for (let i = 0; i < this.currentPath.length; i++) {
      const point = this.currentPath[i]!;
      const distance = vec2.distance(worldPos, point.position);
      if (distance < hitRadius) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Convert point type between corner and smooth
   * - If smooth/symmetric: convert to corner (remove handles)
   * - If corner: convert to smooth (add default handles)
   */
  private convertPointType(pointIndex: number): void {
    const point = this.currentPath[pointIndex];
    if (!point) return;

    const prevPoint = this.currentPath[pointIndex - 1] ?? null;
    const nextPoint = this.currentPath[pointIndex + 1] ?? null;

    this.currentPath[pointIndex] = convertPointTypeUtil(
      point,
      prevPoint ? prevPoint.position : null,
      nextPoint ? nextPoint.position : null
    );

    this.updatePreviewNode();
  }

  private createPathNode(points: PathPoint[], closed: boolean = false): PathNode {
    const transform = createDefaultTransform();
    transform.position = { x: 0, y: 0 };
    transform.anchor = { x: 0, y: 0 };

    return {
      id: this.context.generateId(),
      name: 'Path',
      type: 'path',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      points: points.map((p) => ({ ...p, position: { ...p.position } })),
      closed,
      fills: closed ? [this.context.defaultFill] : [],
      strokes: [this.context.defaultStroke],
    };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onDeactivate(): void {
    // Finalize any in-progress path when switching tools
    if (this.isDrawing && this.currentPath.length >= 2) {
      this.finalizePath(false);
    } else {
      this.cancelPath();
    }
  }
}
