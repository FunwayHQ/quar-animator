/**
 * Eraser Tool for Quar Animator
 *
 * Removes paths or path points that the eraser touches.
 * Uses world transforms for correct intersection with rotated/scaled/nested nodes.
 * Supports undo via onTransformStart.
 */

import type { CanvasPointerEvent, Node, PathNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, mat3, rect } from '../math';
import {
  getPathBounds,
  forEachSegment,
  getAbsoluteControlPoints,
  createPolygonPath,
  createStarPath,
} from '../path/pathUtils';
import { bezier } from '../path/bezier';

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
  private undoPushed: boolean = false;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  getOptions(): Readonly<EraserToolOptions> {
    return { ...this.options };
  }

  setOptions(options: Partial<EraserToolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setSize(size: number): void {
    this.options.size = Math.max(1, Math.min(100, size));
  }

  setMode(mode: EraserMode): void {
    this.options.mode = mode;
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.isErasing = true;
    this.erasedNodeIds.clear();
    this.undoPushed = false;
    this.state.isDragging = true;
    this.state.startWorldPos = { ...event.worldPosition };

    this.eraseAt(event.worldPosition);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isErasing) return;

    this.eraseAt(event.worldPosition);
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    if (!this.isErasing) return;

    this.isErasing = false;
    this.erasedNodeIds.clear();
    this.undoPushed = false;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
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
   * Push undo once per erase gesture (on first actual deletion).
   */
  private ensureUndo(): void {
    if (!this.undoPushed) {
      this.context.onTransformStart?.();
      this.undoPushed = true;
    }
  }

  /**
   * Stroke eraser mode: delete entire paths that the eraser touches.
   * Uses world transforms for correct hit testing.
   */
  private eraseStrokes(worldPos: Vector2, radius: number): void {
    const nodesToRemove: string[] = [];

    this.context.sceneGraph.traverse((node) => {
      if (this.erasedNodeIds.has(node.id)) return;

      if (
        node.type !== 'path' &&
        node.type !== 'rectangle' &&
        node.type !== 'ellipse' &&
        node.type !== 'polygon' &&
        node.type !== 'image' &&
        node.type !== 'text'
      )
        return;

      if (this.nodeIntersectsEraser(node, worldPos, radius)) {
        nodesToRemove.push(node.id);
        this.erasedNodeIds.add(node.id);
      }
    });

    if (nodesToRemove.length > 0) {
      this.ensureUndo();

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
  }

  /**
   * Point eraser mode: delete individual points from path nodes.
   * Uses world transforms for correct point positioning.
   */
  private erasePoints(worldPos: Vector2, radius: number): void {
    const pathsToUpdate: Map<string, PathNode> = new Map();
    const pathsToRemove: string[] = [];

    this.context.sceneGraph.traverse((node) => {
      if (node.type !== 'path') return;

      const pathNode = node;
      const worldMatrix = this.context.sceneGraph.getWorldTransform(node.id);

      // Check each point in the path
      const pointsToKeep: number[] = [];
      for (let i = 0; i < pathNode.points.length; i++) {
        const point = pathNode.points[i];
        const worldPoint = mat3.transformPoint(worldMatrix, point.position);
        const distance = vec2.distance(worldPoint, worldPos);
        if (distance > radius) {
          pointsToKeep.push(i);
        }
      }

      if (pointsToKeep.length < pathNode.points.length) {
        if (pointsToKeep.length < 2) {
          pathsToRemove.push(pathNode.id);
        } else {
          const newPoints = pointsToKeep.map((i) => pathNode.points[i]);
          pathsToUpdate.set(pathNode.id, {
            ...pathNode,
            points: newPoints,
            closed: pathNode.closed && pointsToKeep.length === pathNode.points.length,
          });
        }
      }
    });

    if (pathsToRemove.length > 0 || pathsToUpdate.size > 0) {
      this.ensureUndo();
    }

    for (const nodeId of pathsToRemove) {
      this.context.sceneGraph.removeNode(nodeId);
    }

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
   * Check if a node intersects with the eraser circle.
   * Uses world transforms for all node types.
   */
  private nodeIntersectsEraser(node: Node, eraserPos: Vector2, eraserRadius: number): boolean {
    const worldMatrix = this.context.sceneGraph.getWorldTransform(node.id);

    if (node.type === 'rectangle' || node.type === 'image') {
      return this.boxNodeIntersectsEraser(node, worldMatrix, eraserPos, eraserRadius);
    }

    if (node.type === 'ellipse') {
      const ellipseNode = node as Node & { radiusX: number; radiusY: number };
      // Transform center to world
      const worldCenter = mat3.transformPoint(worldMatrix, { x: 0, y: 0 });
      // Approximate: use average radius scaled
      const scaleX = Math.sqrt(worldMatrix.a * worldMatrix.a + worldMatrix.b * worldMatrix.b);
      const scaleY = Math.sqrt(worldMatrix.c * worldMatrix.c + worldMatrix.d * worldMatrix.d);
      const avgRadius = (ellipseNode.radiusX * scaleX + ellipseNode.radiusY * scaleY) / 2;
      const distance = vec2.distance(worldCenter, eraserPos);
      return distance < eraserRadius + avgRadius;
    }

    if (node.type === 'polygon') {
      return this.polygonNodeIntersectsEraser(node, worldMatrix, eraserPos, eraserRadius);
    }

    if (node.type === 'text') {
      return this.boxNodeIntersectsEraser(node, worldMatrix, eraserPos, eraserRadius);
    }

    if (node.type === 'path') {
      return this.pathNodeIntersectsEraser(node, worldMatrix, eraserPos, eraserRadius);
    }

    return false;
  }

  /**
   * Hit test for box-like nodes (rectangle, image, text).
   * Transforms all 4 corners to world space and tests circle-OBB intersection.
   */
  private boxNodeIntersectsEraser(
    node: Node,
    worldMatrix: import('@quar/types').Matrix3,
    eraserPos: Vector2,
    eraserRadius: number
  ): boolean {
    let w: number;
    let h: number;

    if (node.type === 'rectangle') {
      w = node.width;
      h = node.height;
    } else if (node.type === 'image') {
      w = node.width;
      h = node.height;
    } else {
      // Text: approximate with bounding box
      w = 100;
      h = 50;
    }

    // Corners in local space (centered at anchor)
    const hw = w / 2;
    const hh = h / 2;
    const corners = [
      mat3.transformPoint(worldMatrix, { x: -hw, y: -hh }),
      mat3.transformPoint(worldMatrix, { x: hw, y: -hh }),
      mat3.transformPoint(worldMatrix, { x: hw, y: hh }),
      mat3.transformPoint(worldMatrix, { x: -hw, y: hh }),
    ];

    return this.circleIntersectsConvexPolygon(eraserPos, eraserRadius, corners);
  }

  /**
   * Hit test for polygon/star nodes.
   */
  private polygonNodeIntersectsEraser(
    node: Node,
    worldMatrix: import('@quar/types').Matrix3,
    eraserPos: Vector2,
    eraserRadius: number
  ): boolean {
    const polyNode = node as import('@quar/types').PolygonNode;
    let pathPoints;

    if (polyNode.innerRadius !== undefined) {
      pathPoints = createStarPath(0, 0, polyNode.radius, polyNode.innerRadius, polyNode.sides);
    } else {
      pathPoints = createPolygonPath(0, 0, polyNode.radius, polyNode.sides);
    }

    // Transform vertices to world space
    const worldVerts = pathPoints.map((p) => mat3.transformPoint(worldMatrix, p.position));

    return this.circleIntersectsConvexPolygon(eraserPos, eraserRadius, worldVerts);
  }

  /**
   * Hit test for path nodes using bezier segment distance.
   */
  private pathNodeIntersectsEraser(
    pathNode: PathNode,
    worldMatrix: import('@quar/types').Matrix3,
    eraserPos: Vector2,
    eraserRadius: number
  ): boolean {
    // Quick bounds check
    const bounds = getPathBounds(pathNode.points, pathNode.closed);
    if (bounds) {
      // Transform bounds corners to world and check expanded AABB
      const worldCorners = [
        mat3.transformPoint(worldMatrix, { x: bounds.x, y: bounds.y }),
        mat3.transformPoint(worldMatrix, { x: bounds.x + bounds.width, y: bounds.y }),
        mat3.transformPoint(worldMatrix, {
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height,
        }),
        mat3.transformPoint(worldMatrix, { x: bounds.x, y: bounds.y + bounds.height }),
      ];

      const worldBounds = {
        x: Math.min(...worldCorners.map((c) => c.x)),
        y: Math.min(...worldCorners.map((c) => c.y)),
        width: 0,
        height: 0,
      };
      worldBounds.width = Math.max(...worldCorners.map((c) => c.x)) - worldBounds.x;
      worldBounds.height = Math.max(...worldCorners.map((c) => c.y)) - worldBounds.y;

      const expandedBounds = rect.expand(worldBounds, eraserRadius);
      if (!rect.contains(expandedBounds, eraserPos)) {
        return false;
      }
    }

    // Check each path point in world space
    for (const point of pathNode.points) {
      const worldPoint = mat3.transformPoint(worldMatrix, point.position);
      if (vec2.distance(worldPoint, eraserPos) < eraserRadius) {
        return true;
      }
    }

    // Check path segments using bezier nearest-point
    let intersects = false;
    forEachSegment(pathNode.points, pathNode.closed, (p0, p1) => {
      if (intersects) return;

      const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);

      // Transform control points to world space
      const wp0 = mat3.transformPoint(worldMatrix, p0.position);
      const wcp1 = mat3.transformPoint(worldMatrix, cp1);
      const wcp2 = mat3.transformPoint(worldMatrix, cp2);
      const wp3 = mat3.transformPoint(worldMatrix, p1.position);

      const nearest = bezier.nearestPoint(wp0, wcp1, wcp2, wp3, eraserPos);
      if (nearest.distance < eraserRadius) {
        intersects = true;
      }
    });

    return intersects;
  }

  /**
   * Test if a circle intersects a convex polygon.
   * Checks: point inside polygon, and circle-edge distance.
   */
  private circleIntersectsConvexPolygon(
    center: Vector2,
    radius: number,
    vertices: Vector2[]
  ): boolean {
    if (vertices.length < 3) return false;

    // Check if center is inside polygon (winding number / cross-product test)
    let inside = true;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const cross = (b.x - a.x) * (center.y - a.y) - (b.y - a.y) * (center.x - a.x);
      if (cross < 0) {
        inside = false;
        break;
      }
    }
    // Try the other winding direction
    if (!inside) {
      inside = true;
      for (let i = 0; i < n; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % n];
        const cross = (b.x - a.x) * (center.y - a.y) - (b.y - a.y) * (center.x - a.x);
        if (cross > 0) {
          inside = false;
          break;
        }
      }
    }
    if (inside) return true;

    // Check distance from circle center to each edge
    for (let i = 0; i < n; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const dist = pointToSegmentDistance(center, a, b);
      if (dist < radius) return true;
    }

    return false;
  }

  /**
   * Check if a circle intersects with an axis-aligned rectangle.
   */
  private circleIntersectsRect(
    circleCenter: Vector2,
    circleRadius: number,
    bounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    const closestX = Math.max(bounds.x, Math.min(circleCenter.x, bounds.x + bounds.width));
    const closestY = Math.max(bounds.y, Math.min(circleCenter.y, bounds.y + bounds.height));
    const distanceX = circleCenter.x - closestX;
    const distanceY = circleCenter.y - closestY;
    const distanceSq = distanceX * distanceX + distanceY * distanceY;
    return distanceSq < circleRadius * circleRadius;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onDeactivate(): void {
    if (this.isErasing) {
      this.isErasing = false;
      this.erasedNodeIds.clear();
      this.undoPushed = false;
      this.resetState();
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Distance from a point to a line segment.
 */
function pointToSegmentDistance(p: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < 1e-10) {
    return vec2.distance(p, a);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return vec2.distance(p, proj);
}
