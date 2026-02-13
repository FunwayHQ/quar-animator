/**
 * Direct Selection Tool for Quar Animator
 * Allows editing individual path points and bezier handles
 */

import type {
  CanvasPointerEvent,
  PathNode,
  PathPoint,
  Vector2,
  Node,
  Rect,
  Matrix3,
  ImageNode,
} from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, mat3, rect } from '../math';
import {
  convertPointType as convertPointTypeUtil,
  updateHandleWithSymmetry,
} from '../path/pointUtils';
import {
  getPolygonBounds,
  getPathBounds,
  getAllPoints,
  getSubpathBoundaries,
  setAllPoints,
  getContourRange,
} from '../path/pathUtils';
import { getTextBounds } from '../font/textMetrics';

// ============================================================================
// Image Vertex Helpers
// ============================================================================

/** Get the 4 corner positions of an image node as virtual PathPoints [BL, BR, TL, TR]. */
function getImagePoints(node: ImageNode): PathPoint[] {
  const ax = node.transform.anchor.x;
  const ay = node.transform.anchor.y;
  const x0 = -node.width * ax;
  const y0 = -node.height * ay;
  const x1 = x0 + node.width;
  const y1 = y0 + node.height;
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  const vo = node.vertexOffsets;
  const ox = (i: number): number => (vo ? (vo[i]?.x ?? 0) : 0);
  const oy = (i: number): number => (vo ? (vo[i]?.y ?? 0) : 0);
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  return [
    {
      position: { x: x0 + ox(0), y: y0 + oy(0) },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    },
    {
      position: { x: x1 + ox(1), y: y0 + oy(1) },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    },
    {
      position: { x: x0 + ox(2), y: y1 + oy(2) },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    },
    {
      position: { x: x1 + ox(3), y: y1 + oy(3) },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    },
  ];
}

/** Convert absolute point positions back to vertexOffsets for an image node. */
function imagePointsToOffsets(
  node: ImageNode,
  points: PathPoint[]
): [Vector2, Vector2, Vector2, Vector2] {
  const ax = node.transform.anchor.x;
  const ay = node.transform.anchor.y;
  const x0 = -node.width * ax;
  const y0 = -node.height * ay;
  const x1 = x0 + node.width;
  const y1 = y0 + node.height;
  // Base positions: BL, BR, TL, TR
  const bases = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x0, y: y1 },
    { x: x1, y: y1 },
  ];
  return [
    { x: points[0].position.x - bases[0].x, y: points[0].position.y - bases[0].y },
    { x: points[1].position.x - bases[1].x, y: points[1].position.y - bases[1].y },
    { x: points[2].position.x - bases[2].x, y: points[2].position.y - bases[2].y },
    { x: points[3].position.x - bases[3].x, y: points[3].position.y - bases[3].y },
  ];
}

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
  private hasDragged: boolean = false;

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
      this.context.onTransformStart?.();
      this.dragMode = 'dragging-handle';
      this.dragHandle = handleHit;
      this.state.isDragging = true;
      this.hasDragged = false;

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
      this.context.onTransformStart?.();
      this.dragMode = 'dragging-point';
      this.state.isDragging = true;
      this.hasDragged = false;

      // Store initial positions of all selected points
      this.initialPointPositions.clear();
      for (const sel of this.selectedPoints) {
        const node = this.context.sceneGraph.getNode(sel.nodeId);
        if (node) {
          const allPts =
            node.type === 'image' ? getImagePoints(node) : getAllPoints(node as PathNode);
          if (allPts[sel.pointIndex]) {
            const key = `${sel.nodeId}:${sel.pointIndex}`;
            this.initialPointPositions.set(key, { ...allPts[sel.pointIndex].position });
          }
        }
      }
      return;
    }

    // No path point/handle hit — try node-level hit testing (groups, other shapes)
    const rawHit = this.hitTestNode(worldPos);
    const enteredGroupId = this.context.getEnteredGroupId?.() ?? null;
    const hitNode = rawHit ? this.resolveHitToScope(rawHit) : null;

    // Click on a group that's already selected → enter it
    if (hitNode && hitNode.type === 'group') {
      const selectedIds = this.context.getSelectedIds();
      if (selectedIds.has(hitNode.id)) {
        // Already selected → enter the group
        this.context.setEnteredGroupId?.(hitNode.id);
        this.clearPointSelection();
        this.context.clearSelection();
      } else {
        // Not selected → select the group
        this.clearPointSelection();
        if (event.shiftKey) {
          this.context.addToSelection(hitNode.id);
        } else {
          this.context.setSelectedIds([hitNode.id]);
        }
      }
      return;
    }

    // Click on a convertible shape that's already selected → convert to path for point editing
    if (
      hitNode &&
      (hitNode.type === 'rectangle' || hitNode.type === 'ellipse' || hitNode.type === 'polygon') &&
      this.context.getSelectedIds().has(hitNode.id) &&
      this.context.convertShapeToPath
    ) {
      const newId = this.context.convertShapeToPath(hitNode.id);
      if (newId) {
        this.clearPointSelection();
        // Select all points of the new path node for immediate editing
        const newNode = this.context.sceneGraph.getNode(newId);
        if (newNode && newNode.type === 'path') {
          const allPts = getAllPoints(newNode);
          for (let i = 0; i < allPts.length; i++) {
            this.selectedPoints.push({ nodeId: newId, pointIndex: i });
          }
        }
        return;
      }
    }

    // Click on a non-path node → select it
    if (hitNode && hitNode.type !== 'path') {
      this.clearPointSelection();
      if (event.shiftKey) {
        this.context.addToSelection(hitNode.id);
      } else {
        this.context.setSelectedIds([hitNode.id]);
      }
      return;
    }

    // Click on a path (node-level, not on a specific point) → select the path
    if (hitNode && hitNode.type === 'path') {
      this.clearPointSelection();
      if (event.shiftKey) {
        this.context.addToSelection(hitNode.id);
      } else {
        this.context.setSelectedIds([hitNode.id]);
      }
      return;
    }

    // Click outside the entered group → exit group, select root ancestor
    if (rawHit && !hitNode && enteredGroupId) {
      this.context.setEnteredGroupId?.(null);
      this.clearPointSelection();
      let rootNode = rawHit;
      while (rootNode.parent) {
        const p = this.context.sceneGraph.getNode(rootNode.parent);
        if (!p) break;
        rootNode = p;
      }
      this.context.setSelectedIds([rootNode.id]);
      return;
    }

    // Clicked on empty space - clear both point and node selection
    if (!event.shiftKey) {
      if (enteredGroupId) {
        this.context.setEnteredGroupId?.(null);
      }
      this.clearPointSelection();
      this.context.clearSelection();
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
      this.hasDragged = true;
      // Move selected points — convert world-space delta to local-space
      const worldDelta = vec2.subtract(worldPos, this.dragStartPoint);

      for (const sel of this.selectedPoints) {
        const node = this.context.sceneGraph.getNode(sel.nodeId);
        if (!node) continue;

        const key = `${sel.nodeId}:${sel.pointIndex}`;
        const initialPos = this.initialPointPositions.get(key);
        if (!initialPos) continue;

        // Convert world delta to local delta via inverse linear transform
        const linearMatrix = this.getNodeLinearMatrix(node);
        const invLinear = mat3.invert(linearMatrix);
        const localDelta = invLinear ? mat3.transformPoint(invLinear, worldDelta) : worldDelta;

        if (node.type === 'image') {
          // Image vertex editing — update vertexOffsets
          const imgNode = node;
          const pts = getImagePoints(imgNode);
          pts[sel.pointIndex] = {
            ...pts[sel.pointIndex],
            position: vec2.add(initialPos, localDelta),
          };
          const offsets = imagePointsToOffsets(imgNode, pts);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          this.context.sceneGraph.updateNode(sel.nodeId, { vertexOffsets: offsets } as any);
        } else {
          const pathNode = node as PathNode;
          const allPts = getAllPoints(pathNode);
          const newAll = [...allPts];
          newAll[sel.pointIndex] = {
            ...newAll[sel.pointIndex],
            position: vec2.add(initialPos, localDelta),
          };

          const split = setAllPoints(pathNode, newAll);
          this.context.sceneGraph.updateNode(sel.nodeId, {
            points: split.points,
            subpaths: split.subpaths,
          });
        }
      }
    } else if (this.dragMode === 'dragging-handle' && this.dragHandle) {
      this.hasDragged = true;
      // Move handle — convert world position to local-space handle offset
      const node = this.context.sceneGraph.getNode(this.dragHandle.nodeId) as PathNode;
      if (!node) return;

      const allPts = getAllPoints(node);
      const point = allPts[this.dragHandle.pointIndex];
      // Get the point's world position and compute handle offset in world space
      const pointWorldPos = this.getPointWorldPosition(node, point);
      const worldHandleOffset = vec2.subtract(worldPos, pointWorldPos);

      // Convert world handle offset to local-space via inverse linear transform
      const linearMatrix = this.getNodeLinearMatrix(node);
      const invLinear = mat3.invert(linearMatrix);
      const localHandleOffset = invLinear
        ? mat3.transformPoint(invLinear, worldHandleOffset)
        : worldHandleOffset;

      const handleType = this.dragHandle.type === 'handle-out' ? 'out' : 'in';

      const newAll = [...allPts];
      // Ctrl+drag: break symmetry, move only the dragged handle
      if (event.ctrlKey) {
        const updated = { ...point };
        if (handleType === 'out') {
          updated.handleOut = localHandleOffset;
        } else {
          updated.handleIn = localHandleOffset;
        }
        // Convert to corner point since handles are now independent
        updated.type = 'corner';
        newAll[this.dragHandle.pointIndex] = updated;
      } else {
        newAll[this.dragHandle.pointIndex] = updateHandleWithSymmetry(
          point,
          handleType,
          localHandleOffset
        );
      }
      const split = setAllPoints(node, newAll);
      this.context.sceneGraph.updateNode(this.dragHandle.nodeId, {
        points: split.points,
        subpaths: split.subpaths,
      });
    }
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    // Notify about vertex transform completion (for auto-keyframe)
    if (
      this.hasDragged &&
      (this.dragMode === 'dragging-point' || this.dragMode === 'dragging-handle')
    ) {
      const nodeIds = new Set(this.selectedPoints.map((sp) => sp.nodeId));
      this.context.onTransformComplete?.(nodeIds, 'vertex-move');
    }

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

      case 'Escape': {
        const groupId = this.context.getEnteredGroupId?.() ?? null;
        if (this.selectedPoints.length > 0) {
          this.clearPointSelection();
        } else if (groupId) {
          // Exit group and select the group itself
          this.context.setEnteredGroupId?.(null);
          this.context.setSelectedIds([groupId]);
        } else {
          // No points selected, not in group — return to selection tool
          this.context.setActiveTool('selection');
        }
        break;
      }

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

    // Test path nodes
    const paths = this.getPathNodes();
    for (const node of paths) {
      const allPts = getAllPoints(node);
      for (let i = 0; i < allPts.length; i++) {
        const point = allPts[i];
        const pointWorldPos = this.getPointWorldPosition(node, point);
        if (vec2.distance(worldPos, pointWorldPos) < hitRadius) {
          return { type: 'point', nodeId: node.id, pointIndex: i };
        }
      }
    }

    // Test image nodes (4 corner vertices)
    const images = this.getImageNodes();
    for (const node of images) {
      const pts = getImagePoints(node);
      for (let i = 0; i < pts.length; i++) {
        const pointWorldPos = this.getPointWorldPosition(node as unknown as PathNode, pts[i]);
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

      const point = getAllPoints(node)[sel.pointIndex];
      if (!point) continue;

      const pointWorldPos = this.getPointWorldPosition(node, point);
      const linearMatrix = this.getNodeLinearMatrix(node);

      // Test handle in
      if (point.handleIn) {
        const handleWorldOffset = mat3.transformPoint(linearMatrix, point.handleIn);
        const handleWorldPos = vec2.add(pointWorldPos, handleWorldOffset);
        if (vec2.distance(worldPos, handleWorldPos) < hitRadius) {
          return { type: 'handle-in', nodeId: node.id, pointIndex: sel.pointIndex };
        }
      }

      // Test handle out
      if (point.handleOut) {
        const handleWorldOffset = mat3.transformPoint(linearMatrix, point.handleOut);
        const handleWorldPos = vec2.add(pointWorldPos, handleWorldOffset);
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
      const allPts = getAllPoints(node);
      const boundaries = getSubpathBoundaries(node);

      for (let c = 0; c < boundaries.length - 1; c++) {
        const start = boundaries[c];
        const end = boundaries[c + 1];
        const contourLen = end - start;
        const numSegments = node.closed ? contourLen : contourLen - 1;

        for (let local = 0; local < numSegments; local++) {
          const flatIdx = start + local;
          const nextFlatIdx = start + ((local + 1) % contourLen);

          const p1 = allPts[flatIdx];
          const p2 = allPts[nextFlatIdx];

          const p1World = this.getPointWorldPosition(node, p1);
          const p2World = this.getPointWorldPosition(node, p2);

          // Simple line segment distance (ignoring bezier for now)
          const dist = this.pointToLineDistance(worldPos, p1World, p2World);

          if (dist < hitRadius) {
            // Calculate t parameter
            const t = this.getParameterOnLine(worldPos, p1World, p2World);
            return { type: 'segment', nodeId: node.id, segmentIndex: flatIdx, t };
          }
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
        const allPts = getAllPoints(node);
        for (let i = 0; i < allPts.length; i++) {
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

    // Push undo snapshot before deleting
    this.context.onTransformStart?.();

    // Group by node
    const pointsByNode = new Map<string, number[]>();
    for (const sel of this.selectedPoints) {
      const indices = pointsByNode.get(sel.nodeId) || [];
      indices.push(sel.pointIndex);
      pointsByNode.set(sel.nodeId, indices);
    }

    // Delete points from each node, respecting contour boundaries
    for (const [nodeId, indices] of pointsByNode) {
      const node = this.context.sceneGraph.getNode(nodeId) as PathNode;
      if (!node || node.type !== 'path') continue;

      const allPts = getAllPoints(node);
      const boundaries = getSubpathBoundaries(node);
      const deleteSet = new Set(indices);

      // Split into contours, remove marked points, drop empty contours
      const newContours: PathPoint[][] = [];
      for (let c = 0; c < boundaries.length - 1; c++) {
        const start = boundaries[c] ?? 0;
        const end = boundaries[c + 1] ?? allPts.length;
        const contour = allPts.slice(start, end).filter((_pt, idx) => !deleteSet.has(start + idx));
        if (contour.length > 0) newContours.push(contour);
      }

      const totalRemaining = newContours.reduce((sum, c) => sum + c.length, 0);
      if (totalRemaining < 2) {
        // Remove the entire path if less than 2 points remain
        this.context.sceneGraph.removeNode(nodeId);
      } else {
        const points = newContours[0];
        const subpaths = newContours.length > 1 ? newContours.slice(1) : undefined;
        this.context.sceneGraph.updateNode(nodeId, { points, subpaths });
      }
    }

    this.clearPointSelection();
  }

  private addPointToSegment(hit: SegmentHit): void {
    const node = this.context.sceneGraph.getNode(hit.nodeId) as PathNode;
    if (!node || node.type !== 'path') return;

    const allPts = getAllPoints(node);
    const boundaries = getSubpathBoundaries(node);
    const { start, end } = getContourRange(boundaries, hit.segmentIndex);
    const contourLen = end - start;
    const localIdx = hit.segmentIndex - start;
    const nextLocalIdx = (localIdx + 1) % contourLen;

    const p1 = allPts[hit.segmentIndex];
    const p2 = allPts[start + nextLocalIdx];

    const p1World = this.getPointWorldPosition(node, p1);
    const p2World = this.getPointWorldPosition(node, p2);

    // Interpolate position in world space
    const newWorldPos = {
      x: p1World.x + (p2World.x - p1World.x) * hit.t,
      y: p1World.y + (p2World.y - p1World.y) * hit.t,
    };

    // Convert back to local coordinates via inverse world matrix
    const worldMatrix = this.getNodeWorldMatrix(node);
    const invWorld = mat3.invert(worldMatrix);
    const localPos = invWorld
      ? mat3.transformPoint(invWorld, newWorldPos)
      : {
          x: newWorldPos.x - node.transform.position.x,
          y: newWorldPos.y - node.transform.position.y,
        };

    const newPoint: PathPoint = {
      position: localPos,
      handleIn: null,
      handleOut: null,
      type: 'corner',
    };

    // Insert the new point after the segment start within the flat array
    const newAll = [...allPts];
    newAll.splice(hit.segmentIndex + 1, 0, newPoint);

    // Rebuild points + subpaths — boundaries shifted by 1 for contours after insertion
    const newContours: PathPoint[][] = [];
    let offset = 0;
    for (let c = 0; c < boundaries.length - 1; c++) {
      const cStart = boundaries[c];
      const cEnd = boundaries[c + 1];
      const extra = cStart <= hit.segmentIndex && hit.segmentIndex < cEnd ? 1 : 0;
      newContours.push(newAll.slice(offset, offset + (cEnd - cStart) + extra));
      offset += cEnd - cStart + extra;
    }

    const points = newContours[0];
    const subpaths = newContours.length > 1 ? newContours.slice(1) : undefined;
    this.context.sceneGraph.updateNode(hit.nodeId, { points, subpaths });

    // Select the new point (flat index = hit.segmentIndex + 1)
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

    const allPts = getAllPoints(node);
    const point = allPts[pointIndex];
    if (!point) return;

    // Resolve neighbors within the same contour
    const boundaries = getSubpathBoundaries(node);
    const { start, end } = getContourRange(boundaries, pointIndex);
    const contourLen = end - start;
    const localIdx = pointIndex - start;

    const prevIdx = localIdx > 0 ? pointIndex - 1 : node.closed ? end - 1 : -1;
    const nextIdx = localIdx < contourLen - 1 ? pointIndex + 1 : node.closed ? start : -1;

    const prevPoint = prevIdx >= 0 ? allPts[prevIdx] : null;
    const nextPoint = nextIdx >= 0 && nextIdx !== pointIndex ? allPts[nextIdx] : null;

    const newAll = [...allPts];
    newAll[pointIndex] = convertPointTypeUtil(
      point,
      prevPoint ? prevPoint.position : null,
      nextPoint ? nextPoint.position : null
    );
    const split = setAllPoints(node, newAll);
    this.context.sceneGraph.updateNode(nodeId, {
      points: split.points,
      subpaths: split.subpaths,
    });

    // Select the converted point
    this.selectPoint(nodeId, pointIndex, false);
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Get path nodes that are in the current scope (respects group entry).
   * At root level: only root-level paths. Inside a group: only children of that group.
   */
  private getPathNodes(): PathNode[] {
    const paths: PathNode[] = [];
    this.context.sceneGraph.traverseVisible((node: Node) => {
      if (node.type === 'path') {
        const resolved = this.resolveHitToScope(node);
        if (resolved && resolved.id === node.id) {
          paths.push(node);
        }
      }
    });
    return paths;
  }

  /** Get image nodes in scope that support vertex editing. */
  private getImageNodes(): ImageNode[] {
    const images: ImageNode[] = [];
    this.context.sceneGraph.traverseVisible((node: Node) => {
      if (node.type === 'image') {
        const resolved = this.resolveHitToScope(node);
        if (resolved && resolved.id === node.id) {
          images.push(node);
        }
      }
    });
    return images;
  }

  // --------------------------------------------------------------------------
  // Node-Level Hit Testing (for groups and non-path nodes)
  // --------------------------------------------------------------------------

  /**
   * Walk a hit node up to the appropriate scope level based on enteredGroupId.
   */
  private resolveHitToScope(hitNode: Node): Node | null {
    const enteredGroupId = this.context.getEnteredGroupId?.() ?? null;

    if (enteredGroupId === null) {
      let current = hitNode;
      while (current.parent !== null) {
        const parent = this.context.sceneGraph.getNode(current.parent);
        if (!parent) break;
        current = parent;
      }
      return current;
    }

    let current = hitNode;
    if (current.id === enteredGroupId) return null;

    while (current.parent !== enteredGroupId) {
      if (current.parent === null) return null;
      const parent = this.context.sceneGraph.getNode(current.parent);
      if (!parent) return null;
      current = parent;
    }
    return current;
  }

  /**
   * Find the topmost node at the given world position (any type, not just paths).
   */
  private hitTestNode(worldPos: Vector2): Node | null {
    let hitNode: Node | null = null;
    const hitTolerance = 8 / this.context.camera.zoom;

    this.context.sceneGraph.traverseVisible((node: Node) => {
      if (node.type === 'group') return; // Skip groups — hit children, resolve up

      const localBounds = this.getLocalBoundsForNode(node);
      if (!localBounds) return;

      const worldMatrix: Matrix3 = node.parent
        ? this.context.sceneGraph.getWorldTransform(node.id)
        : mat3.compose(node.transform.position, node.transform.rotation, node.transform.scale);

      const worldBounds = this.transformBoundsToWorld(localBounds, worldMatrix);

      let testBounds = worldBounds;
      if (node.type === 'path') {
        testBounds = {
          x: worldBounds.x - hitTolerance,
          y: worldBounds.y - hitTolerance,
          width: Math.max(worldBounds.width, hitTolerance * 2) + hitTolerance * 2,
          height: Math.max(worldBounds.height, hitTolerance * 2) + hitTolerance * 2,
        };
      }

      if (rect.contains(testBounds, worldPos)) {
        hitNode = node;
      }
    });

    return hitNode;
  }

  /**
   * Get local-space AABB for any node type.
   */
  private getLocalBoundsForNode(node: Node): Rect | null {
    switch (node.type) {
      case 'rectangle': {
        const anchor = node.transform.anchor;
        return {
          x: -node.width * anchor.x,
          y: -node.height * anchor.y,
          width: node.width,
          height: node.height,
        };
      }
      case 'ellipse':
        return {
          x: -node.radiusX,
          y: -node.radiusY,
          width: node.radiusX * 2,
          height: node.radiusY * 2,
        };
      case 'polygon':
        return getPolygonBounds(0, 0, node.radius, node.sides, 1, 1, node.innerRadius);
      case 'path': {
        const primaryBounds = getPathBounds(node.points, node.closed);
        if (!primaryBounds) return null;
        if (!node.subpaths || node.subpaths.length === 0) return primaryBounds;
        const allBounds = [primaryBounds];
        for (const sp of node.subpaths) {
          const spBounds = getPathBounds(sp, true);
          if (spBounds) allBounds.push(spBounds);
        }
        return allBounds.length === 1
          ? primaryBounds
          : allBounds.reduce((a, b) => rect.union(a, b));
      }
      case 'text': {
        const rawBounds = getTextBounds(
          node.content,
          node.fontFamily,
          node.fontSize,
          node.lineHeight,
          node.letterSpacing,
          node.textAlign
        );
        const anchor = node.transform.anchor;
        if (anchor.x !== 0 || anchor.y !== 0) {
          return {
            x: -rawBounds.width * anchor.x,
            y: -rawBounds.height * anchor.y,
            width: rawBounds.width,
            height: rawBounds.height,
          };
        }
        return rawBounds;
      }
      case 'image': {
        const anchor = node.transform.anchor;
        return {
          x: -node.width * anchor.x,
          y: -node.height * anchor.y,
          width: node.width,
          height: node.height,
        };
      }
      default:
        return null;
    }
  }

  /**
   * Transform local bounds through a world matrix to get world-space AABB.
   */
  private transformBoundsToWorld(localBounds: Rect, worldMatrix: Matrix3): Rect {
    const { x, y, width, height } = localBounds;
    const corners = [
      mat3.transformPoint(worldMatrix, { x, y }),
      mat3.transformPoint(worldMatrix, { x: x + width, y }),
      mat3.transformPoint(worldMatrix, { x: x + width, y: y + height }),
      mat3.transformPoint(worldMatrix, { x, y: y + height }),
    ];
    let minX = corners[0].x,
      minY = corners[0].y,
      maxX = corners[0].x,
      maxY = corners[0].y;
    for (let i = 1; i < 4; i++) {
      if (corners[i].x < minX) minX = corners[i].x;
      if (corners[i].y < minY) minY = corners[i].y;
      if (corners[i].x > maxX) maxX = corners[i].x;
      if (corners[i].y > maxY) maxY = corners[i].y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Get the world transform matrix for a node, including parent chain.
   * Excludes the node's own anchor to keep local-space math consistent.
   */
  private getNodeWorldMatrix(node: PathNode | Node) {
    const local = mat3.compose(
      node.transform.position,
      node.transform.rotation,
      node.transform.scale
    );
    if (!node.parent) return local;
    const parentWorld = this.context.sceneGraph.getWorldTransform(node.parent);
    return mat3.multiply(parentWorld, local);
  }

  /**
   * Get the linear part of the world matrix (rotation + scale, no translation).
   * Used for transforming direction vectors / offsets (handles).
   */
  private getNodeLinearMatrix(node: PathNode | Node) {
    const m = this.getNodeWorldMatrix(node);
    return { a: m.a, b: m.b, c: m.c, d: m.d, tx: 0, ty: 0 };
  }

  private getPointWorldPosition(node: PathNode | Node, point: PathPoint): Vector2 {
    const worldMatrix = this.getNodeWorldMatrix(node);
    return mat3.transformPoint(worldMatrix, point.position);
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
    this.context.setEnteredGroupId?.(null);
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
