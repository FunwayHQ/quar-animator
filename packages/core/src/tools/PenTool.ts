/**
 * Pen Tool for Quar Animator
 * Creates custom bezier paths by clicking and dragging
 */

import type { CanvasPointerEvent, PathNode, PathPoint, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';
import { vec2 } from '../math';

// ============================================================================
// PenTool Class
// ============================================================================

export class PenTool extends BaseTool {
  readonly type = 'pen' as const;
  readonly cursor = 'crosshair';

  private currentPath: PathPoint[] = [];
  private isDrawing: boolean = false;
  private isDraggingHandle: boolean = false;
  private previewNode: PathNode | null = null;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    const worldPos = { ...event.worldPosition };

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
    if (this.currentPath.length > 2) {
      const firstPoint = this.currentPath[0].position;
      const distance = vec2.distance(worldPos, firstPoint);
      const closeThreshold = 10 / this.context.camera.zoom; // Screen pixels converted to world units

      if (distance < closeThreshold) {
        this.finalizePath(true);
        return;
      }
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

    const worldPos = { ...event.worldPosition };
    this.state.currentWorldPos = worldPos;

    if (this.isDraggingHandle && this.currentPath.length > 0) {
      // Update handle of the last point
      const lastPoint = this.currentPath[this.currentPath.length - 1];
      const handleOut = vec2.subtract(worldPos, lastPoint.position);

      // Check if the handle has significant length
      if (vec2.length(handleOut) > 1) {
        lastPoint.handleOut = handleOut;
        lastPoint.handleIn = { x: -handleOut.x, y: -handleOut.y };
        lastPoint.type = 'smooth';
      }

      this.updatePreviewNode();
    }
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    this.isDraggingHandle = false;
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

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private finalizePath(closed: boolean): void {
    if (this.currentPath.length < 2) {
      this.cancelPath();
      return;
    }

    // Create final path node
    const node = this.createPathNode(this.currentPath, closed);

    // Add to scene graph
    this.context.sceneGraph.addNode(node);

    // Select the new node
    this.context.setSelectedIds([node.id]);

    // Reset state
    this.resetPenState();
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
      const point = this.currentPath[i];
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

    if (point.type === 'corner') {
      // Convert to smooth with default handles
      const defaultHandleLength = 30;

      // Calculate handle direction based on neighboring points
      let direction: Vector2 = { x: 1, y: 0 };

      if (this.currentPath.length > 1) {
        const prevPoint = this.currentPath[pointIndex - 1];
        const nextPoint = this.currentPath[pointIndex + 1];

        if (prevPoint && nextPoint) {
          // Direction from prev to next
          const toNext = vec2.subtract(nextPoint.position, prevPoint.position);
          const len = vec2.length(toNext);
          if (len > 0) {
            direction = { x: toNext.x / len, y: toNext.y / len };
          }
        } else if (prevPoint) {
          // Direction from prev to this
          const toPrev = vec2.subtract(point.position, prevPoint.position);
          const len = vec2.length(toPrev);
          if (len > 0) {
            direction = { x: toPrev.x / len, y: toPrev.y / len };
          }
        } else if (nextPoint) {
          // Direction from this to next
          const toNext = vec2.subtract(nextPoint.position, point.position);
          const len = vec2.length(toNext);
          if (len > 0) {
            direction = { x: toNext.x / len, y: toNext.y / len };
          }
        }
      }

      point.handleOut = {
        x: direction.x * defaultHandleLength,
        y: direction.y * defaultHandleLength,
      };
      point.handleIn = {
        x: -direction.x * defaultHandleLength,
        y: -direction.y * defaultHandleLength,
      };
      point.type = 'smooth';
    } else {
      // Convert to corner (remove handles)
      point.handleIn = null;
      point.handleOut = null;
      point.type = 'corner';
    }

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
      fill: closed ? this.context.defaultFill : null,
      stroke: this.context.defaultStroke,
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
