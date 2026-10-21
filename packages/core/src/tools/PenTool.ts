/**
 * Pen Tool for Quar Animator
 * Creates custom bezier paths by clicking and dragging
 */

import type { CanvasPointerEvent, Node, PathNode, PathPoint, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';
import { vec2, mat3 } from '../math';
import {
  convertPointType as convertPointTypeUtil,
  updateHandleWithSymmetry,
} from '../path/pointUtils';
import { centerPathNodeGeometry, getSubpathBoundaries, reversePath } from '../path/pathUtils';
import {
  deletePathPoints,
  insertPathPoint,
  nearestPathPoint,
  nearestPathSegment,
} from '../path/pathEditing';

/** A crosshair with a small + or − beside it (the Pen over a selected path). */
function badgeCursor(sign: 'add' | 'remove' | 'continue'): string {
  const cross = 'M8 1v14M1 8h14';
  const badge =
    sign === 'add' ? 'M16 19h7M19.5 15.5v7' : sign === 'remove' ? 'M16 19h7' : 'M17 22l5-7';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none">` +
    `<path d="${cross} ${badge}" stroke="#fff" stroke-width="3"/>` +
    `<path d="${cross} ${badge}" stroke="#000" stroke-width="1.2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 8, crosshair`;
}

const ADD_POINT_CURSOR = badgeCursor('add');
const REMOVE_POINT_CURSOR = badgeCursor('remove');
const CONTINUE_PATH_CURSOR = badgeCursor('continue');

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
  /** Not drawing: what a click on a path under the pointer would do */
  private hoverEdit: 'add' | 'remove' | 'continue' | null = null;
  /**
   * Drawing on from an open path's end: the path as it was, and whether from
   * its start (the points are drawn reversed, then turned back)
   */
  private continuing: { node: PathNode; fromStart: boolean } | null = null;
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

    // On a selected path: a click on a segment adds a point, on a point removes it
    if (!this.isDrawing && this.editSelectedPath(event.worldPosition)) return;

    // On an open path's end: draw on from there
    if (!this.isDrawing) {
      const end = this.openPathEndAt(event.worldPosition);
      if (end) {
        this.startContinuing(end.node, end.fromStart);
        return;
      }
    }

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
    if (!this.isDrawing) {
      this.hoverEdit =
        this.selectedPathTarget(event.worldPosition)?.edit ??
        (this.openPathEndAt(event.worldPosition) ? 'continue' : null);
      return;
    }

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
        // Remove last point (back to the path being continued: leave it as it was)
        if (this.continuing && this.currentPath.length <= this.continuing.node.points.length) {
          this.cancelPath();
        } else if (this.currentPath.length > 0) {
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

  /** Over a selected path: + to add a point on a segment, − to remove a point. */
  getCursor(): string {
    if (this.hoverEdit === 'add') return ADD_POINT_CURSOR;
    if (this.hoverEdit === 'remove') return REMOVE_POINT_CURSOR;
    if (this.hoverEdit === 'continue') return CONTINUE_PATH_CURSOR;
    return this.cursor;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  /**
   * What's under the pointer on a selected (unlocked) path: one of its points
   * (but not an open path's ends, which a click starts drawing from) to
   * remove, or a segment to add a point to.
   */
  private selectedPathTarget(
    worldPos: Vector2
  ):
    | { edit: 'remove'; node: PathNode; index: number }
    | { edit: 'add'; node: PathNode; segmentIndex: number; t: number }
    | null {
    const radius = 8 / this.context.camera.zoom;
    const { sceneGraph } = this.context;
    for (const id of this.context.getSelectedIds()) {
      const node = sceneGraph.getNode(id);
      if (node?.type !== 'path' || this.isLockedInScene(node)) continue;
      const toWorld = sceneGraph.getWorldTransform(id);
      const index = nearestPathPoint(node, toWorld, worldPos, radius);
      if (index !== null) {
        if (this.isOpenEnd(node, index)) continue;
        return { edit: 'remove', node, index };
      }
      const segment = nearestPathSegment(node, toWorld, worldPos, radius);
      if (segment) return { edit: 'add', node, segmentIndex: segment.segmentIndex, t: segment.t };
    }
    return null;
  }

  /** The first or last point of an open path's contour. */
  private isOpenEnd(node: PathNode, index: number): boolean {
    if (node.closed) return false;
    const boundaries = getSubpathBoundaries(node);
    return boundaries.some((start, c) => {
      const end = boundaries[c + 1];
      return end !== undefined && end > start && (index === start || index === end - 1);
    });
  }

  private isLockedInScene(node: Node): boolean {
    for (let current: Node | undefined = node; current; ) {
      if (current.locked) return true;
      current = current.parent ? this.context.sceneGraph.getNode(current.parent) : undefined;
    }
    return false;
  }

  /**
   * The end of an open path (one contour, unlocked) under the pointer, the
   * topmost such path winning.
   */
  private openPathEndAt(worldPos: Vector2): { node: PathNode; fromStart: boolean } | null {
    const reach = 10 / this.context.camera.zoom;
    let found: { node: PathNode; fromStart: boolean } | null = null;
    this.context.sceneGraph.traverseVisible((node: Node) => {
      if (node.type !== 'path' || node.closed || (node.subpaths?.length ?? 0) > 0) return;
      if (node.points.length < 2 || this.isLockedInScene(node)) return;
      const toWorld = this.context.sceneGraph.getWorldTransform(node.id);
      const near = (point: PathPoint) =>
        vec2.distance(mat3.transformPoint(toWorld, point.position), worldPos) < reach;
      if (near(node.points[node.points.length - 1]!)) found = { node, fromStart: false };
      else if (near(node.points[0]!)) found = { node, fromStart: true };
    });
    return found;
  }

  /** Pick up drawing an open path from one end: its points, in world space, become the path drawn. */
  private startContinuing(node: PathNode, fromStart: boolean): void {
    const m = this.context.sceneGraph.getWorldTransform(node.id);
    const linear = { ...m, tx: 0, ty: 0 };
    const world = node.points.map((point) => ({
      ...point,
      position: mat3.transformPoint(m, point.position),
      handleIn: point.handleIn ? mat3.transformPoint(linear, point.handleIn) : null,
      handleOut: point.handleOut ? mat3.transformPoint(linear, point.handleOut) : null,
    }));
    this.currentPath = fromStart ? reversePath(world) : world;
    this.continuing = { node: structuredClone(node), fromStart };
    this.isDrawing = true;
    this.isDraggingHandle = false;
    // The path itself shows what's there; the overlay draws the rest
    this.previewNode = null;
    this.hoverEdit = null;
  }

  /**
   * Put the points drawn on back into the path continued (in its own space,
   * the right way round), closing it when asked; undoable, its keyframes kept.
   */
  private finishContinuing(closed: boolean): void {
    if (!this.continuing) return;
    const { node, fromStart } = this.continuing;
    const added = this.currentPath.length - node.points.length;
    const inverse = mat3.invert(this.context.sceneGraph.getWorldTransform(node.id));
    if ((added <= 0 && !closed) || !inverse || !this.context.sceneGraph.getNode(node.id)) {
      this.cancelPath();
      return;
    }
    const linear = { ...inverse, tx: 0, ty: 0 };
    const drawn = this.currentPath.map((point) => ({
      ...point,
      position: mat3.transformPoint(inverse, point.position),
      handleIn: point.handleIn ? mat3.transformPoint(linear, point.handleIn) : null,
      handleOut: point.handleOut ? mat3.transformPoint(linear, point.handleOut) : null,
    }));
    const points = fromStart ? reversePath(drawn) : drawn;
    const newPoints = fromStart ? points.slice(0, added) : points.slice(points.length - added);

    this.context.onTransformStart?.();
    this.context.sceneGraph.updateNode(node.id, {
      points,
      closed,
      // Closed, it can take a fill: the Pen's own, if it had none
      ...(closed && node.fills.length === 0 ? { fills: [this.context.defaultFill] } : {}),
    });
    if (added > 0) {
      this.context.onPathPointsChange?.(node.id, node, {
        kind: 'extend',
        at: fromStart ? 'start' : 'end',
        points: newPoints,
      });
    }
    this.resetPenState();
    this.context.setSelectedIds([node.id]);
    this.context.setActiveTool('selection');
  }

  /** Add or remove a point of a selected path under the pointer; true when it did. */
  private editSelectedPath(worldPos: Vector2): boolean {
    const target = this.selectedPathTarget(worldPos);
    if (!target) return false;
    const { node } = target;
    const before = structuredClone(node);
    if (target.edit === 'remove') {
      const remaining = deletePathPoints(node, [target.index]);
      // A path keeps at least two points: the click does nothing more
      if (!remaining) return true;
      this.context.onTransformStart?.();
      this.context.sceneGraph.updateNode(node.id, remaining);
      this.context.onPathPointsChange?.(node.id, before, {
        kind: 'delete',
        indices: [target.index],
      });
    } else {
      this.context.onTransformStart?.();
      this.context.sceneGraph.updateNode(
        node.id,
        insertPathPoint(node, target.segmentIndex, target.t)
      );
      this.context.onPathPointsChange?.(node.id, before, {
        kind: 'insert',
        segmentIndex: target.segmentIndex,
        t: target.t,
      });
    }
    this.hoverEdit = this.selectedPathTarget(worldPos)?.edit ?? null;
    return true;
  }

  private finalizePath(closed: boolean): void {
    if (this.continuing) {
      this.finishContinuing(closed);
      return;
    }
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
    // Its outline in a color that shows where it's drawn
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    node.strokes = [this.context.strokeAt?.(center) ?? this.context.defaultStroke];
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
    this.continuing = null;
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
