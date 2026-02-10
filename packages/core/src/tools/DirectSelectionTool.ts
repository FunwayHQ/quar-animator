/**
 * Direct Selection Tool for Quar Animator
 * Allows editing individual path points and bezier handles
 */

import type { CanvasPointerEvent, PathNode, PathPoint, Vector2, Node } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2 } from '../math';
import {
  convertPointType as convertPointTypeUtil,
  updateHandleWithSymmetry,
} from '../path/pointUtils';

// ============================================================================
// Types
// ============================================================================

/** What the user is interacting with */
interface PointHit {
  type: 'point';
  nodeId: string;
  pointIndex: number;
}

interface HandleHit {
  type: 'handle-in' | 'handle-out';
  nodeId: string;
  pointIndex: number;
}

interface SegmentHit {
  type: 'segment';
  nodeId: string;
  segmentIndex: number; // Index of the start point of the segment
  t: number; // Parameter along the segment (0-1)
}

type Hit = PointHit | HandleHit | SegmentHit | null;

interface SelectedPoint {
  nodeId: string;
  pointIndex: number;
}

type DragMode = 'idle' | 'dragging-point' | 'dragging-handle';

// ============================================================================
// DirectSelectionTool Class
// ============================================================================

export class DirectSelectionTool extends BaseTool {
  readonly type = 'direct-selection' as const;
  readonly cursor = 'default';

  // Selection state - which points are selected
  private selectedPoints: SelectedPoint[] = [];

  // Current hover state
  private currentHover: Hit = null;

  // Drag state
  private dragMode: DragMode = 'idle';
  private dragStartPoint: Vector2 | null = null;
  private dragHandle: HandleHit | null = null;
  private initialPointPositions: Map<string, Vector2> = new Map();

  // Double-click detection
  private lastClickTime: number = 0;
  private lastClickPosition: Vector2 | null = null;
  private doubleClickThreshold: number = 300; // ms
  private doubleClickDistance: number = 5; // world units

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
    this.state.startWorldPos = worldPos;
    this.dragStartPoint = worldPos;

    // Check for double-click on segment (only when not using shift key for selection toggle)
    const now = Date.now();
    if (
      !event.shiftKey &&
      this.lastClickPosition &&
      now - this.lastClickTime < this.doubleClickThreshold &&
      vec2.distance(worldPos, this.lastClickPosition) <
        this.doubleClickDistance / this.context.camera.zoom
    ) {
      // Double-click detected - check if we're hitting a segment (not a point)
      const pointHit = this.hitTestPoint(worldPos);
      if (!pointHit) {
        const segmentHit = this.hitTestSegment(worldPos);
        if (segmentHit) {
          this.addPointToSegment(segmentHit);
          this.lastClickTime = 0;
          this.lastClickPosition = null;
          return;
        }
      }
    }
    this.lastClickTime = now;
    this.lastClickPosition = worldPos;

    // Alt+click on point to convert point type
    if (event.altKey) {
      const pointHit = this.hitTestPoint(worldPos);
      if (pointHit) {
        this.convertPointType(pointHit.nodeId, pointHit.pointIndex);
        return;
      }
    }

    // Hit test for handles first (higher priority), then points
    const handleHit = this.hitTestHandle(worldPos);
    if (handleHit) {
      // Start dragging handle
      this.dragMode = 'dragging-handle';
      this.dragHandle = handleHit;
      this.state.isDragging = true;

      // Note: initial handle position stored implicitly via dragHandle
      return;
    }

    // Hit test for points
    const pointHit = this.hitTestPoint(worldPos);
    if (pointHit) {
      const isAlreadySelected = this.isPointSelected(pointHit.nodeId, pointHit.pointIndex);

      if (event.shiftKey) {
        // Shift+click: toggle selection
        if (isAlreadySelected) {
          this.deselectPoint(pointHit.nodeId, pointHit.pointIndex);
          // Don't start dragging if we just deselected
          return;
        } else {
          this.selectPoint(pointHit.nodeId, pointHit.pointIndex, true);
        }
      } else if (!isAlreadySelected) {
        // Click on unselected point: select only this point
        this.selectPoint(pointHit.nodeId, pointHit.pointIndex, false);
      }

      // Start dragging selected points
      this.dragMode = 'dragging-point';
      this.state.isDragging = true;

      // Store initial positions of all selected points
      this.initialPointPositions.clear();
      for (const sel of this.selectedPoints) {
        const node = this.context.sceneGraph.getNode(sel.nodeId) as PathNode;
        if (node && node.points[sel.pointIndex]) {
          const key = `${sel.nodeId}:${sel.pointIndex}`;
          this.initialPointPositions.set(key, { ...node.points[sel.pointIndex].position });
        }
      }
      return;
    }

    // Clicked on empty space - clear selection
    if (!event.shiftKey) {
      this.clearPointSelection();
    }
  }

  onPointerMove(event: CanvasPointerEvent): void {
    const worldPos = { ...event.worldPosition };
    this.state.currentWorldPos = worldPos;

    if (!this.state.isDragging) {
      // Update hover state for cursor feedback
      this.currentHover = this.hitTestHandle(worldPos) || this.hitTestPoint(worldPos);
      return;
    }

    if (!this.dragStartPoint) return;

    if (this.dragMode === 'dragging-point') {
      // Move selected points
      const delta = vec2.subtract(worldPos, this.dragStartPoint);

      for (const sel of this.selectedPoints) {
        const node = this.context.sceneGraph.getNode(sel.nodeId) as PathNode;
        if (!node) continue;

        const key = `${sel.nodeId}:${sel.pointIndex}`;
        const initialPos = this.initialPointPositions.get(key);
        if (!initialPos) continue;

        const newPoints = [...node.points];
        newPoints[sel.pointIndex] = {
          ...newPoints[sel.pointIndex],
          position: vec2.add(initialPos, delta),
        };

        this.context.sceneGraph.updateNode(sel.nodeId, { points: newPoints });
      }
    } else if (this.dragMode === 'dragging-handle' && this.dragHandle) {
      // Move handle
      const node = this.context.sceneGraph.getNode(this.dragHandle.nodeId) as PathNode;
      if (!node) return;

      const point = node.points[this.dragHandle.pointIndex];
      const handleOffset = vec2.subtract(worldPos, point.position);
      const handleType = this.dragHandle.type === 'handle-out' ? 'out' : 'in';

      const newPoints = [...node.points];
      newPoints[this.dragHandle.pointIndex] = updateHandleWithSymmetry(
        point,
        handleType,
        handleOffset
      );
      this.context.sceneGraph.updateNode(this.dragHandle.nodeId, { points: newPoints });
    }
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    this.dragMode = 'idle';
    this.dragStartPoint = null;
    this.dragHandle = null;
    this.initialPointPositions.clear();
    this.state.isDragging = false;
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        this.deleteSelectedPoints();
        break;

      case 'Escape':
        if (this.selectedPoints.length > 0) {
          this.clearPointSelection();
        } else {
          // No points selected — return to selection tool
          this.context.setActiveTool('selection');
        }
        break;

      case 'a':
        if (event.ctrlKey || event.metaKey) {
          // Select all points in selected paths
          event.preventDefault();
          this.selectAllPointsInSelectedPaths();
        }
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Hit Testing
  // --------------------------------------------------------------------------

  private hitTestPoint(worldPos: Vector2): PointHit | null {
    const hitRadius = 8 / this.context.camera.zoom;

    // Only test path nodes
    const paths = this.getPathNodes();

    for (const node of paths) {
      for (let i = 0; i < node.points.length; i++) {
        const point = node.points[i];
        const pointWorldPos = this.getPointWorldPosition(node, point);

        if (vec2.distance(worldPos, pointWorldPos) < hitRadius) {
          return { type: 'point', nodeId: node.id, pointIndex: i };
        }
      }
    }

    return null;
  }

  private hitTestHandle(worldPos: Vector2): HandleHit | null {
    const hitRadius = 6 / this.context.camera.zoom;

    // Only show handles for selected points
    for (const sel of this.selectedPoints) {
      const node = this.context.sceneGraph.getNode(sel.nodeId) as PathNode;
      if (!node || node.type !== 'path') continue;

      const point = node.points[sel.pointIndex];
      if (!point) continue;

      const pointWorldPos = this.getPointWorldPosition(node, point);

      // Test handle in
      if (point.handleIn) {
        const handleWorldPos = vec2.add(pointWorldPos, point.handleIn);
        if (vec2.distance(worldPos, handleWorldPos) < hitRadius) {
          return { type: 'handle-in', nodeId: node.id, pointIndex: sel.pointIndex };
        }
      }

      // Test handle out
      if (point.handleOut) {
        const handleWorldPos = vec2.add(pointWorldPos, point.handleOut);
        if (vec2.distance(worldPos, handleWorldPos) < hitRadius) {
          return { type: 'handle-out', nodeId: node.id, pointIndex: sel.pointIndex };
        }
      }
    }

    return null;
  }

  private hitTestSegment(worldPos: Vector2): SegmentHit | null {
    const hitRadius = 8 / this.context.camera.zoom;

    const paths = this.getPathNodes();

    for (const node of paths) {
      const numSegments = node.closed ? node.points.length : node.points.length - 1;

      for (let i = 0; i < numSegments; i++) {
        const p1 = node.points[i];
        const p2 = node.points[(i + 1) % node.points.length];

        const p1World = this.getPointWorldPosition(node, p1);
        const p2World = this.getPointWorldPosition(node, p2);

        // Simple line segment distance (ignoring bezier for now)
        const dist = this.pointToLineDistance(worldPos, p1World, p2World);

        if (dist < hitRadius) {
          // Calculate t parameter
          const t = this.getParameterOnLine(worldPos, p1World, p2World);
          return { type: 'segment', nodeId: node.id, segmentIndex: i, t };
        }
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Selection Management
  // --------------------------------------------------------------------------

  private selectPoint(nodeId: string, pointIndex: number, additive: boolean): void {
    if (!additive) {
      this.selectedPoints = [];
    }

    // Check if already selected
    if (!this.isPointSelected(nodeId, pointIndex)) {
      this.selectedPoints.push({ nodeId, pointIndex });
    }

    // Also select the node in the scene
    if (!additive) {
      this.context.setSelectedIds([nodeId]);
    } else {
      this.context.addToSelection(nodeId);
    }
  }

  private deselectPoint(nodeId: string, pointIndex: number): void {
    this.selectedPoints = this.selectedPoints.filter(
      (sel) => !(sel.nodeId === nodeId && sel.pointIndex === pointIndex)
    );
  }

  private isPointSelected(nodeId: string, pointIndex: number): boolean {
    return this.selectedPoints.some(
      (sel) => sel.nodeId === nodeId && sel.pointIndex === pointIndex
    );
  }

  private clearPointSelection(): void {
    this.selectedPoints = [];
  }

  private selectAllPointsInSelectedPaths(): void {
    const selectedNodeIds = this.context.getSelectedIds();
    this.selectedPoints = [];

    for (const nodeId of selectedNodeIds) {
      const node = this.context.sceneGraph.getNode(nodeId);
      if (node?.type === 'path') {
        for (let i = 0; i < node.points.length; i++) {
          this.selectedPoints.push({ nodeId, pointIndex: i });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Point Operations
  // --------------------------------------------------------------------------

  private deleteSelectedPoints(): void {
    if (this.selectedPoints.length === 0) return;

    // Group by node
    const pointsByNode = new Map<string, number[]>();
    for (const sel of this.selectedPoints) {
      const indices = pointsByNode.get(sel.nodeId) || [];
      indices.push(sel.pointIndex);
      pointsByNode.set(sel.nodeId, indices);
    }

    // Delete points from each node (in reverse order to maintain indices)
    for (const [nodeId, indices] of pointsByNode) {
      const node = this.context.sceneGraph.getNode(nodeId) as PathNode;
      if (!node || node.type !== 'path') continue;

      // Sort indices in descending order
      const sortedIndices = [...indices].sort((a, b) => b - a);

      const newPoints = [...node.points];
      for (const index of sortedIndices) {
        newPoints.splice(index, 1);
      }

      if (newPoints.length < 2) {
        // Remove the entire path if less than 2 points remain
        this.context.sceneGraph.removeNode(nodeId);
      } else {
        this.context.sceneGraph.updateNode(nodeId, { points: newPoints });
      }
    }

    this.clearPointSelection();
  }

  private addPointToSegment(hit: SegmentHit): void {
    const node = this.context.sceneGraph.getNode(hit.nodeId) as PathNode;
    if (!node || node.type !== 'path') return;

    const p1 = node.points[hit.segmentIndex];
    const p2Idx = (hit.segmentIndex + 1) % node.points.length;
    const p2 = node.points[p2Idx];

    const p1World = this.getPointWorldPosition(node, p1);
    const p2World = this.getPointWorldPosition(node, p2);

    // Interpolate position
    const newPos = {
      x: p1World.x + (p2World.x - p1World.x) * hit.t,
      y: p1World.y + (p2World.y - p1World.y) * hit.t,
    };

    // Convert back to local coordinates
    const localPos = {
      x: newPos.x - node.transform.position.x,
      y: newPos.y - node.transform.position.y,
    };

    const newPoint: PathPoint = {
      position: localPos,
      handleIn: null,
      handleOut: null,
      type: 'corner',
    };

    // Insert the new point
    const newPoints = [...node.points];
    newPoints.splice(hit.segmentIndex + 1, 0, newPoint);

    this.context.sceneGraph.updateNode(hit.nodeId, { points: newPoints });

    // Select the new point
    this.selectPoint(hit.nodeId, hit.segmentIndex + 1, false);
  }

  /**
   * Convert point type between corner and smooth
   * - If smooth/symmetric: convert to corner (remove handles)
   * - If corner: convert to smooth (add default handles based on neighbors)
   */
  private convertPointType(nodeId: string, pointIndex: number): void {
    const node = this.context.sceneGraph.getNode(nodeId) as PathNode;
    if (!node || node.type !== 'path') return;

    const points = node.points;
    const point = points[pointIndex];
    if (!point) return;

    // Resolve neighbors, wrapping around for closed paths
    const prevIdx = pointIndex > 0 ? pointIndex - 1 : node.closed ? points.length - 1 : -1;
    const nextIdx = pointIndex < points.length - 1 ? pointIndex + 1 : node.closed ? 0 : -1;

    const prevPoint = prevIdx >= 0 ? points[prevIdx] : null;
    const nextPoint = nextIdx >= 0 && nextIdx !== pointIndex ? points[nextIdx] : null;

    const newPoints = [...points];
    newPoints[pointIndex] = convertPointTypeUtil(
      point,
      prevPoint ? prevPoint.position : null,
      nextPoint ? nextPoint.position : null
    );
    this.context.sceneGraph.updateNode(nodeId, { points: newPoints });

    // Select the converted point
    this.selectPoint(nodeId, pointIndex, false);
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private getPathNodes(): PathNode[] {
    const paths: PathNode[] = [];
    this.context.sceneGraph.traverseVisible((node: Node) => {
      if (node.type === 'path') {
        paths.push(node);
      }
    });
    return paths;
  }

  private getPointWorldPosition(node: PathNode, point: PathPoint): Vector2 {
    return {
      x: point.position.x + node.transform.position.x,
      y: point.position.y + node.transform.position.y,
    };
  }

  private pointToLineDistance(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return vec2.distance(point, lineStart);
    }

    let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closest = {
      x: lineStart.x + t * dx,
      y: lineStart.y + t * dy,
    };

    return vec2.distance(point, closest);
  }

  private getParameterOnLine(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) return 0;

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
    return Math.max(0, Math.min(1, t));
  }

  // --------------------------------------------------------------------------
  // Public Accessors
  // --------------------------------------------------------------------------

  /**
   * Get currently selected points
   */
  getSelectedPoints(): SelectedPoint[] {
    return [...this.selectedPoints];
  }

  /**
   * Get current cursor based on hover state
   */
  getCursor(): string {
    if (this.currentHover) {
      if (this.currentHover.type === 'point') {
        return 'move';
      } else if (
        this.currentHover.type === 'handle-in' ||
        this.currentHover.type === 'handle-out'
      ) {
        return 'crosshair';
      } else if (this.currentHover.type === 'segment') {
        return 'copy'; // Indicates adding a point
      }
    }
    return this.cursor;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onActivate(): void {
    // When activating, clear the point selection
    // User can click to select specific points
    this.selectedPoints = [];
  }

  onDeactivate(): void {
    this.clearPointSelection();
    this.dragMode = 'idle';
    this.dragStartPoint = null;
    this.dragHandle = null;
    this.initialPointPositions.clear();
    this.lastClickTime = 0;
    this.lastClickPosition = null;
    this.currentHover = null;
    this.state.isDragging = false;
  }
}
