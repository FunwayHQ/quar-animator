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
  bendSegment,
} from '../path/pathUtils';
import {
  deletePathPoints,
  insertPathPoint,
  nearestPathSegment,
  segmentEndIndex,
} from '../path/pathEditing';
import { getTextLocalBounds } from '../font/textPlacement';

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
    { x: points[0]!.position.x - bases[0]!.x, y: points[0]!.position.y - bases[0]!.y },
    { x: points[1]!.position.x - bases[1]!.x, y: points[1]!.position.y - bases[1]!.y },
    { x: points[2]!.position.x - bases[2]!.x, y: points[2]!.position.y - bases[2]!.y },
    { x: points[3]!.position.x - bases[3]!.x, y: points[3]!.position.y - bases[3]!.y },
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

type DragMode = 'idle' | 'dragging-point' | 'dragging-handle' | 'bending-segment' | 'marquee';

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
  /** The point pressed to start a point drag, where it was: it decides the snap. */
  private grabbed: { nodeId: string; pointIndex: number; world: Vector2 } | null = null;

  // Segment bend: the segment pressed, its ends as they were, and the click's Shift
  private bend: {
    hit: SegmentHit;
    endIndex: number;
    start: PathPoint;
    end: PathPoint;
    shiftKey: boolean;
  } | null = null;

  // Marquee: a drag from off the path's points picks the points inside
  private marqueeRect: Rect | null = null;
  private marqueeAdditive = false;

  // Arrow-key nudges: one undo step per run of presses
  private nudgeUndoPushed = false;

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

      // The pressed point snaps; the rest of the picked points move with it
      const pressed = this.context.sceneGraph.getNode(pointHit.nodeId);
      const pressedPoints =
        pressed?.type === 'image'
          ? getImagePoints(pressed)
          : pressed?.type === 'path'
            ? getAllPoints(pressed)
            : [];
      const pressedPoint = pressedPoints[pointHit.pointIndex];
      this.grabbed =
        pressed && pressedPoint
          ? {
              nodeId: pointHit.nodeId,
              pointIndex: pointHit.pointIndex,
              world: this.getPointWorldPosition(pressed, pressedPoint),
            }
          : null;

      // Store initial positions of all selected points
      this.initialPointPositions.clear();
      for (const sel of this.selectedPoints) {
        const node = this.context.sceneGraph.getNode(sel.nodeId);
        if (node) {
          const allPts =
            node.type === 'image' ? getImagePoints(node) : getAllPoints(node as PathNode);
          if (allPts[sel.pointIndex]) {
            const key = `${sel.nodeId}:${sel.pointIndex}`;
            this.initialPointPositions.set(key, { ...allPts[sel.pointIndex]!.position });
          }
        }
      }
      return;
    }

    // On a segment: a drag bends it (a click still picks the layer, on release)
    const segmentHit = this.hitTestSegment(worldPos);
    if (segmentHit) {
      const node = this.context.sceneGraph.getNode(segmentHit.nodeId) as PathNode;
      const allPts = getAllPoints(node);
      const endIndex = segmentEndIndex(node, segmentHit.segmentIndex);
      this.bend = {
        hit: segmentHit,
        endIndex,
        start: allPts[segmentHit.segmentIndex]!,
        end: allPts[endIndex]!,
        shiftKey: event.shiftKey,
      };
      this.dragMode = 'bending-segment';
      this.state.isDragging = true;
      this.hasDragged = false;
      return;
    }

    // Nothing of a path here: a drag draws a marquee to pick points, and a
    // click picks a layer (handled on release, once it's clearly a click)
    this.dragMode = 'marquee';
    this.marqueeRect = null;
    this.marqueeAdditive = event.shiftKey;
    this.state.isDragging = true;
  }

  /** A click off any point or handle: select, enter or convert the layer there. */
  private handleNodeClick(worldPos: Vector2, shiftKey: boolean): void {
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
        if (shiftKey) {
          this.context.addToSelection(hitNode.id);
        } else {
          this.context.setSelectedIds([hitNode.id]);
        }
      }
      return;
    }

    // Click on a convertible shape → convert to path for point editing
    if (
      hitNode &&
      (hitNode.type === 'rectangle' || hitNode.type === 'ellipse' || hitNode.type === 'polygon') &&
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
      if (shiftKey) {
        this.context.addToSelection(hitNode.id);
      } else {
        this.context.setSelectedIds([hitNode.id]);
      }
      return;
    }

    // Click on a path (node-level, not on a specific point) → select the path
    if (hitNode && hitNode.type === 'path') {
      this.clearPointSelection();
      if (shiftKey) {
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
    if (!shiftKey) {
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
      this.currentHover =
        this.hitTestHandle(worldPos) ||
        this.hitTestPoint(worldPos) ||
        this.hitTestSegment(worldPos);
      return;
    }

    if (!this.dragStartPoint) return;

    if (this.dragMode === 'bending-segment' && this.bend) {
      const worldDelta = vec2.subtract(worldPos, this.dragStartPoint);
      if (!this.hasDragged && vec2.length(worldDelta) <= 3 / this.context.camera.zoom) return;
      const node = this.context.sceneGraph.getNode(this.bend.hit.nodeId);
      if (node?.type !== 'path') return;
      if (!this.hasDragged) {
        this.hasDragged = true;
        this.context.onTransformStart?.();
        if (!this.context.getSelectedIds().has(node.id)) {
          this.clearPointSelection();
          this.context.setSelectedIds([node.id]);
        }
      }
      const invLinear = mat3.invert(this.getNodeLinearMatrix(node));
      const localDelta = invLinear ? mat3.transformPoint(invLinear, worldDelta) : worldDelta;
      const bent = bendSegment(this.bend.start, this.bend.end, this.bend.hit.t, localDelta);
      const allPts = [...getAllPoints(node)];
      allPts[this.bend.hit.segmentIndex] = bent.start;
      allPts[this.bend.endIndex] = bent.end;
      const split = setAllPoints(node, allPts);
      this.context.sceneGraph.updateNode(node.id, {
        points: split.points,
        subpaths: split.subpaths,
      });
      return;
    }

    if (this.dragMode === 'marquee') {
      // A few pixels of movement before it's a marquee rather than a click
      if (
        this.marqueeRect ||
        vec2.distance(worldPos, this.dragStartPoint) > 3 / this.context.camera.zoom
      ) {
        this.marqueeRect = rect.fromPoints(this.dragStartPoint, worldPos);
      }
      return;
    }

    if (this.dragMode === 'dragging-point') {
      this.hasDragged = true;
      // Move selected points — convert world-space delta to local-space
      const worldDelta = this.snapDragDelta(vec2.subtract(worldPos, this.dragStartPoint));

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
            ...pts[sel.pointIndex]!,
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
            ...newAll[sel.pointIndex]!,
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
      const point = allPts[this.dragHandle.pointIndex]!;
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
      // Alt-drag (as in Illustrator and Figma; Ctrl too, though on a Mac
      // Ctrl-click is a right-click): break symmetry, move only this handle
      if (event.altKey || event.ctrlKey) {
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
    if (this.dragMode === 'bending-segment' && this.bend) {
      if (this.hasDragged) {
        this.context.onTransformComplete?.(new Set([this.bend.hit.nodeId]), 'vertex-move');
      } else if (this.dragStartPoint) {
        this.handleNodeClick(this.dragStartPoint, this.bend.shiftKey);
      }
      this.bend = null;
    }

    if (this.dragMode === 'marquee' && this.dragStartPoint) {
      if (this.marqueeRect) this.selectPointsInRect(this.marqueeRect, this.marqueeAdditive);
      else this.handleNodeClick(this.dragStartPoint, this.marqueeAdditive);
      this.marqueeRect = null;
    }

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
    this.grabbed = null;
    this.initialPointPositions.clear();
    this.state.isDragging = false;
  }

  /**
   * A point drag's world delta, snapped by where it takes the pressed point:
   * onto another point within reach (always), else onto guides and the grid
   * when those snap settings are on (a guide wins on its axis when close).
   */
  private snapDragDelta(delta: Vector2): Vector2 {
    if (!this.grabbed) return delta;
    const target = vec2.add(this.grabbed.world, delta);
    const zoom = this.context.camera.zoom;

    let nearest: Vector2 | null = null;
    let nearestDistance = 6 / zoom;
    for (const node of [...this.getPathNodes(), ...this.getImageNodes()]) {
      const points = node.type === 'image' ? getImagePoints(node) : getAllPoints(node);
      points.forEach((point, pointIndex) => {
        if (this.isPointSelected(node.id, pointIndex)) return; // they're moving too
        const world = this.getPointWorldPosition(node, point);
        const distance = vec2.distance(world, target);
        if (distance < nearestDistance) {
          nearest = world;
          nearestDistance = distance;
        }
      });
    }
    if (nearest) return vec2.subtract(nearest, this.grabbed.world);

    const grid = this.context.getSnapToGrid?.() ? (this.context.getGridSize?.() ?? 20) : null;
    const guides = this.context.getSnapToGuides?.() ? (this.context.getGuides?.() ?? []) : [];
    const snapAxis = (value: number, axis: 'x' | 'y'): number => {
      let best: number | null = null;
      let bestDistance = 5 / zoom;
      for (const guide of guides) {
        if (guide.axis !== axis) continue;
        const distance = Math.abs(guide.position - value);
        if (distance < bestDistance) {
          best = guide.position;
          bestDistance = distance;
        }
      }
      if (best !== null) return best;
      return grid ? Math.round(value / grid) * grid : value;
    };
    return vec2.subtract(
      { x: snapAxis(target.x, 'x'), y: snapAxis(target.y, 'y') },
      this.grabbed.world
    );
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

      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (this.selectedPoints.length === 0) break;
        event.preventDefault();
        if (!this.nudgeUndoPushed) {
          this.context.onTransformStart?.();
          this.nudgeUndoPushed = true;
        }
        // As the Selection tool nudges layers: a grid step when snapping, else 1 (Shift: 10)
        const amount = this.context.getSnapToGrid?.()
          ? (this.context.getGridSize?.() ?? 20)
          : event.shiftKey
            ? 10
            : 1;
        const delta = {
          x: event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
          // World Y runs up
          y: event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0,
        };
        this.nudgeSelectedPoints(delta);
        break;
      }
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    if (!event.key.startsWith('Arrow') || !this.nudgeUndoPushed) return;
    this.nudgeUndoPushed = false;
    // Keyed like a drag when auto-keyframe is on
    const nodeIds = new Set(this.selectedPoints.map((sp) => sp.nodeId));
    this.context.onTransformComplete?.(nodeIds, 'vertex-move');
  }

  /** Move the selected points by a world-space delta (each path in its own space). */
  private nudgeSelectedPoints(worldDelta: Vector2): void {
    const byNode = new Map<string, number[]>();
    for (const sel of this.selectedPoints) {
      byNode.set(sel.nodeId, [...(byNode.get(sel.nodeId) ?? []), sel.pointIndex]);
    }
    for (const [nodeId, indices] of byNode) {
      const node = this.context.sceneGraph.getNode(nodeId);
      if (!node || (node.type !== 'path' && node.type !== 'image')) continue;
      const invLinear = mat3.invert(this.getNodeLinearMatrix(node));
      const localDelta = invLinear ? mat3.transformPoint(invLinear, worldDelta) : worldDelta;
      const points = node.type === 'image' ? getImagePoints(node) : [...getAllPoints(node)];
      for (const index of indices) {
        const point = points[index];
        if (point) points[index] = { ...point, position: vec2.add(point.position, localDelta) };
      }
      if (node.type === 'image') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        this.context.sceneGraph.updateNode(nodeId, {
          vertexOffsets: imagePointsToOffsets(node, points),
        } as any);
      } else {
        const split = setAllPoints(node, points);
        this.context.sceneGraph.updateNode(nodeId, {
          points: split.points,
          subpaths: split.subpaths,
        });
      }
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
        const point = allPts[i]!;
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
        const pointWorldPos = this.getPointWorldPosition(node as unknown as PathNode, pts[i]!);
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

  /** The segment nearest the pointer, within reach, measured along its curve. */
  private hitTestSegment(worldPos: Vector2): SegmentHit | null {
    const hitRadius = 8 / this.context.camera.zoom;
    let best: (SegmentHit & { distance: number }) | null = null;
    for (const node of this.getPathNodes()) {
      const nearest = nearestPathSegment(node, this.getNodeWorldMatrix(node), worldPos, hitRadius);
      if (nearest && (!best || nearest.distance < best.distance)) {
        best = { type: 'segment', nodeId: node.id, ...nearest };
      }
    }
    if (!best) return null;
    const { distance: _distance, ...hit } = best;
    return hit;
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

  /**
   * Pick the points (of the paths and images in reach) inside a world-space
   * rectangle, adding to the picked ones with Shift; their layers become the
   * selection, so their points show.
   */
  private selectPointsInRect(area: Rect, additive: boolean): void {
    const picked: SelectedPoint[] = additive ? [...this.selectedPoints] : [];
    const layers = [...this.getPathNodes(), ...this.getImageNodes()];
    for (const node of layers) {
      const points = node.type === 'image' ? getImagePoints(node) : getAllPoints(node);
      points.forEach((point, pointIndex) => {
        const world = this.getPointWorldPosition(node, point);
        if (
          rect.contains(area, world) &&
          !picked.some((p) => p.nodeId === node.id && p.pointIndex === pointIndex)
        ) {
          picked.push({ nodeId: node.id, pointIndex });
        }
      });
    }
    this.selectedPoints = picked;
    const nodeIds = [...new Set(picked.map((p) => p.nodeId))];
    if (additive) nodeIds.forEach((id) => this.context.addToSelection(id));
    else if (nodeIds.length > 0) this.context.setSelectedIds(nodeIds);
  }

  /** The marquee being dragged, in world space (null when there isn't one). */
  getMarqueeRect(): Rect | null {
    return this.marqueeRect;
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
      const before = structuredClone(node);

      const remaining = deletePathPoints(node, indices);
      if (!remaining) {
        // Remove the entire path if less than 2 points remain
        this.context.sceneGraph.removeNode(nodeId);
      } else {
        this.context.sceneGraph.updateNode(nodeId, remaining);
        this.context.onPathPointsChange?.(nodeId, before, { kind: 'delete', indices });
      }
    }

    this.clearPointSelection();
  }

  private addPointToSegment(hit: SegmentHit): void {
    const node = this.context.sceneGraph.getNode(hit.nodeId) as PathNode;
    if (!node || node.type !== 'path') return;
    this.context.onTransformStart?.();
    const before = structuredClone(node);

    // Split the curve where it was hit (t is the same in local space), so
    // its shape doesn't change
    this.context.sceneGraph.updateNode(hit.nodeId, insertPathPoint(node, hit.segmentIndex, hit.t));
    this.context.onPathPointsChange?.(hit.nodeId, before, {
      kind: 'insert',
      segmentIndex: hit.segmentIndex,
      t: hit.t,
    });

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

    this.context.onTransformStart?.();
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
    // Its handles changed like a handle drag's: keyed the same way
    this.context.onTransformComplete?.(new Set([nodeId]), 'vertex-move');

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
      if (node.type === 'path' && !this.isLockedInScene(node)) {
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
      if (node.type === 'image' && !this.isLockedInScene(node)) {
        const resolved = this.resolveHitToScope(node);
        if (resolved && resolved.id === node.id) {
          images.push(node);
        }
      }
    });
    return images;
  }

  /** Locked, or inside a locked group: not editable on the canvas. */
  private isLockedInScene(node: Node): boolean {
    for (let current: Node | null = node; current; ) {
      if (current.locked) return true;
      current = current.parent ? (this.context.sceneGraph.getNode(current.parent) ?? null) : null;
    }
    return false;
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
      if (this.isLockedInScene(node)) return; // clicks pass through locked layers

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
      case 'text':
        return getTextLocalBounds(node);
      case 'image': {
        const imgNode = node;
        const anchor = node.transform.anchor;
        const w = imgNode.width;
        const h = imgNode.height;
        const x0 = -w * anchor.x;
        const y0 = -h * anchor.y;
        const x1 = x0 + w;
        const y1 = y0 + h;

        // Account for vertex offsets [BL, BR, TL, TR]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const vo: [Vector2, Vector2, Vector2, Vector2] | undefined = imgNode.vertexOffsets;
        if (vo) {
          const corners = [
            { x: x0 + vo[0].x, y: y0 + vo[0].y },
            { x: x1 + vo[1].x, y: y0 + vo[1].y },
            { x: x0 + vo[2].x, y: y1 + vo[2].y },
            { x: x1 + vo[3].x, y: y1 + vo[3].y },
          ];
          let minX = corners[0]!.x,
            minY = corners[0]!.y;
          let maxX = corners[0]!.x,
            maxY = corners[0]!.y;
          for (let i = 1; i < 4; i++) {
            if (corners[i]!.x < minX) minX = corners[i]!.x;
            if (corners[i]!.y < minY) minY = corners[i]!.y;
            if (corners[i]!.x > maxX) maxX = corners[i]!.x;
            if (corners[i]!.y > maxY) maxY = corners[i]!.y;
          }
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }

        return { x: x0, y: y0, width: w, height: h };
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
    let minX = corners[0]!.x,
      minY = corners[0]!.y,
      maxX = corners[0]!.x,
      maxY = corners[0]!.y;
    for (let i = 1; i < 4; i++) {
      if (corners[i]!.x < minX) minX = corners[i]!.x;
      if (corners[i]!.y < minY) minY = corners[i]!.y;
      if (corners[i]!.x > maxX) maxX = corners[i]!.x;
      if (corners[i]!.y > maxY) maxY = corners[i]!.y;
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
        return 'pointer'; // Drag to bend, double-click to add a point
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
    this.marqueeRect = null;
    this.bend = null;
    this.lastClickTime = 0;
    this.lastClickPosition = null;
    this.currentHover = null;
    this.state.isDragging = false;
  }
}
