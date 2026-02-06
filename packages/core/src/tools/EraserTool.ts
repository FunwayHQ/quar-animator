/**
 * Eraser Tool for Quar Animator
 * Removes paths or path points that the eraser touches
 */

import type { CanvasPointerEvent, Node, PathNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, rect } from '../math';
import { getPathBounds } from '../path/pathUtils';

// ============================================================================
// Types
// ============================================================================

export type EraserMode = 'stroke' | 'point';

export interface EraserToolOptions {
  /** Eraser size in pixels (default: 10) */
  size: number;
  /** Eraser mode: 'stroke' deletes entire paths, 'point' deletes individual points */
  mode: EraserMode;
}

// ============================================================================
// EraserTool Class
// ============================================================================

export class EraserTool extends BaseTool {
  readonly type = 'eraser' as const;
  readonly cursor = 'crosshair';

  private options: EraserToolOptions = {
    size: 10,
    mode: 'stroke',
  };

  private isErasing: boolean = false;
  private erasedNodeIds: Set<string> = new Set();

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  /**
   * Get current eraser options
   */
  getOptions(): Readonly<EraserToolOptions> {
    return { ...this.options };
  }

  /**
   * Set eraser options
   */
  setOptions(options: Partial<EraserToolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Set eraser size
   */
  setSize(size: number): void {
    this.options.size = Math.max(1, Math.min(100, size));
  }

  /**
   * Set eraser mode
   */
  setMode(mode: EraserMode): void {
    this.options.mode = mode;
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    this.isErasing = true;
    this.erasedNodeIds.clear();
    this.state.isDragging = true;
    this.state.startWorldPos = { ...event.worldPosition };

    // Perform initial erase at click position
    this.eraseAt(event.worldPosition);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isErasing) return;

    // Continue erasing along the path
    this.eraseAt(event.worldPosition);
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    if (!this.isErasing) return;

    this.isErasing = false;
    this.erasedNodeIds.clear();
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    // [ and ] keys to adjust eraser size
    if (event.key === '[') {
      this.setSize(this.options.size - 5);
    } else if (event.key === ']') {
      this.setSize(this.options.size + 5);
    }
  }

  // --------------------------------------------------------------------------
  // Erase Logic
  // --------------------------------------------------------------------------

  private eraseAt(worldPos: Vector2): void {
    const eraserRadius = this.options.size / this.context.camera.zoom;

    if (this.options.mode === 'stroke') {
      this.eraseStrokes(worldPos, eraserRadius);
    } else {
      this.erasePoints(worldPos, eraserRadius);
    }
  }

  /**
   * Stroke eraser mode: delete entire paths that the eraser touches
   */
  private eraseStrokes(worldPos: Vector2, radius: number): void {
    const nodesToRemove: string[] = [];

    // Find all nodes that intersect with the eraser circle
    this.context.sceneGraph.traverse((node) => {
      // Skip already erased nodes in this stroke
      if (this.erasedNodeIds.has(node.id)) return;

      // Only erase path nodes (and potentially other drawable types)
      if (node.type !== 'path' && node.type !== 'rectangle' && node.type !== 'ellipse') return;

      if (this.nodeIntersectsEraser(node, worldPos, radius)) {
        nodesToRemove.push(node.id);
        this.erasedNodeIds.add(node.id);
      }
    });

    // Remove intersecting nodes
    for (const nodeId of nodesToRemove) {
      this.context.sceneGraph.removeNode(nodeId);
    }

    // Clear selection if any erased nodes were selected
    const selectedIds = this.context.getSelectedIds();
    const newSelection = [...selectedIds].filter((id) => !nodesToRemove.includes(id));
    if (newSelection.length !== selectedIds.size) {
      this.context.setSelectedIds(newSelection);
    }
  }

  /**
   * Point eraser mode: delete individual points from paths
   */
  private erasePoints(worldPos: Vector2, radius: number): void {
    const pathsToUpdate: Map<string, PathNode> = new Map();
    const pathsToRemove: string[] = [];

    // Find all path nodes and check their points
    this.context.sceneGraph.traverse((node) => {
      if (node.type !== 'path') return;

      const pathNode = node;
      const pos = pathNode.transform.position;

      // Check each point in the path
      const pointsToKeep: number[] = [];
      for (let i = 0; i < pathNode.points.length; i++) {
        const point = pathNode.points[i];
        const worldPoint = {
          x: point.position.x + pos.x,
          y: point.position.y + pos.y,
        };

        const distance = vec2.distance(worldPoint, worldPos);
        if (distance > radius) {
          pointsToKeep.push(i);
        }
      }

      // If some points were erased
      if (pointsToKeep.length < pathNode.points.length) {
        if (pointsToKeep.length < 2) {
          // Not enough points remaining, delete entire path
          pathsToRemove.push(pathNode.id);
        } else {
          // Keep remaining points
          const newPoints = pointsToKeep.map((i) => pathNode.points[i]);
          pathsToUpdate.set(pathNode.id, {
            ...pathNode,
            points: newPoints,
            // If path was closed and we removed points, it should become open
            closed: pathNode.closed && pointsToKeep.length === pathNode.points.length,
          });
        }
      }
    });

    // Remove paths with too few points
    for (const nodeId of pathsToRemove) {
      this.context.sceneGraph.removeNode(nodeId);
    }

    // Update paths with remaining points
    for (const [nodeId, updatedNode] of pathsToUpdate) {
      this.context.sceneGraph.updateNode(nodeId, {
        points: updatedNode.points,
        closed: updatedNode.closed,
      });
    }

    // Clear selection if any erased nodes were affected
    const selectedIds = this.context.getSelectedIds();
    const newSelection = [...selectedIds].filter((id) => !pathsToRemove.includes(id));
    if (newSelection.length !== selectedIds.size) {
      this.context.setSelectedIds(newSelection);
    }
  }

  /**
   * Check if a node intersects with the eraser circle
   */
  private nodeIntersectsEraser(node: Node, eraserPos: Vector2, eraserRadius: number): boolean {
    const pos = node.transform.position;

    if (node.type === 'rectangle') {
      const rectNode = node as Node & { width: number; height: number };
      const bounds = {
        x: pos.x - rectNode.width / 2,
        y: pos.y - rectNode.height / 2,
        width: rectNode.width,
        height: rectNode.height,
      };
      return this.circleIntersectsRect(eraserPos, eraserRadius, bounds);
    }

    if (node.type === 'ellipse') {
      const ellipseNode = node as Node & { radiusX: number; radiusY: number };
      // Simplified: treat ellipse as circle with average radius
      const avgRadius = (ellipseNode.radiusX + ellipseNode.radiusY) / 2;
      const distance = vec2.distance(pos, eraserPos);
      return distance < eraserRadius + avgRadius;
    }

    if (node.type === 'path') {
      const pathNode = node;
      return this.eraserIntersectsPath(eraserPos, eraserRadius, pathNode);
    }

    return false;
  }

  /**
   * Check if eraser circle intersects with a path
   */
  private eraserIntersectsPath(
    eraserPos: Vector2,
    eraserRadius: number,
    pathNode: PathNode
  ): boolean {
    const pos = pathNode.transform.position;

    // First, quick bounds check
    const bounds = getPathBounds(pathNode.points, pathNode.closed);
    if (bounds) {
      const worldBounds = {
        x: bounds.x + pos.x,
        y: bounds.y + pos.y,
        width: bounds.width,
        height: bounds.height,
      };

      // Expand bounds by eraser radius for quick rejection
      const expandedBounds = {
        x: worldBounds.x - eraserRadius,
        y: worldBounds.y - eraserRadius,
        width: worldBounds.width + eraserRadius * 2,
        height: worldBounds.height + eraserRadius * 2,
      };

      if (!rect.contains(expandedBounds, eraserPos)) {
        return false;
      }
    }

    // Check each path point
    for (const point of pathNode.points) {
      const worldPoint = {
        x: point.position.x + pos.x,
        y: point.position.y + pos.y,
      };

      if (vec2.distance(worldPoint, eraserPos) < eraserRadius) {
        return true;
      }
    }

    // Check path segments (simplified: check midpoints of segments)
    for (let i = 0; i < pathNode.points.length - 1; i++) {
      const p1 = pathNode.points[i];
      const p2 = pathNode.points[i + 1];

      const midpoint = {
        x: (p1.position.x + p2.position.x) / 2 + pos.x,
        y: (p1.position.y + p2.position.y) / 2 + pos.y,
      };

      if (vec2.distance(midpoint, eraserPos) < eraserRadius) {
        return true;
      }
    }

    // Check closing segment if path is closed
    if (pathNode.closed && pathNode.points.length > 2) {
      const first = pathNode.points[0];
      const last = pathNode.points[pathNode.points.length - 1];

      const midpoint = {
        x: (first.position.x + last.position.x) / 2 + pos.x,
        y: (first.position.y + last.position.y) / 2 + pos.y,
      };

      if (vec2.distance(midpoint, eraserPos) < eraserRadius) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a circle intersects with a rectangle
   */
  private circleIntersectsRect(
    circleCenter: Vector2,
    circleRadius: number,
    bounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    // Find the closest point on the rectangle to the circle center
    const closestX = Math.max(bounds.x, Math.min(circleCenter.x, bounds.x + bounds.width));
    const closestY = Math.max(bounds.y, Math.min(circleCenter.y, bounds.y + bounds.height));

    // Calculate distance from closest point to circle center
    const distanceX = circleCenter.x - closestX;
    const distanceY = circleCenter.y - closestY;
    const distanceSq = distanceX * distanceX + distanceY * distanceY;

    return distanceSq < circleRadius * circleRadius;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onDeactivate(): void {
    // Cancel any in-progress erase operation
    if (this.isErasing) {
      this.isErasing = false;
      this.erasedNodeIds.clear();
      this.resetState();
    }
  }
}
