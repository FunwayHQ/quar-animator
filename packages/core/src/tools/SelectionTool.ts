/**
 * Selection Tool for Quar Animator
 * Selects, moves, and resizes shapes
 */

import type { CanvasPointerEvent, Node, Vector2, Rect, Matrix3 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, rect, mat3 } from '../math';
import { SelectionManager } from '../selection/SelectionManager';
import { TransformHandles } from '../selection/TransformHandles';
import type { HandlePosition, SelectionBounds } from '../selection/types';
import { getPolygonBounds, getPathBounds } from '../path/pathUtils';

/**
 * Transform a local-space AABB through a world matrix and return the new AABB.
 */
function transformBoundsToWorld(localBounds: Rect, worldMatrix: Matrix3): Rect {
  const { x, y, width, height } = localBounds;
  const corners = [
    mat3.transformPoint(worldMatrix, { x, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y: y + height }),
    mat3.transformPoint(worldMatrix, { x, y: y + height }),
  ];

  let minX = corners[0].x;
  let minY = corners[0].y;
  let maxX = corners[0].x;
  let maxY = corners[0].y;
  for (let i = 1; i < 4; i++) {
    if (corners[i].x < minX) minX = corners[i].x;
    if (corners[i].y < minY) minY = corners[i].y;
    if (corners[i].x > maxX) maxX = corners[i].x;
    if (corners[i].y > maxY) maxY = corners[i].y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ============================================================================
// Types
// ============================================================================

type SelectionMode = 'idle' | 'selecting' | 'moving' | 'marquee' | 'resizing' | 'rotating';

interface ResizeState {
  handle: HandlePosition;
  initialBounds: SelectionBounds;
  initialNodeStates: Map<string, NodeResizeState>;
}

interface RotationState {
  initialBounds: SelectionBounds;
  initialAngle: number; // Angle from center to start point (radians)
  initialRotations: Map<string, number>; // Initial rotation of each node
}

interface NodeResizeState {
  position: Vector2;
  width?: number;
  height?: number;
  radiusX?: number;
  radiusY?: number;
  radius?: number; // For polygon nodes
  scale?: Vector2; // For polygon non-uniform scaling
}

// ============================================================================
// SelectionTool Class
// ============================================================================

export class SelectionTool extends BaseTool {
  readonly type = 'selection' as const;
  readonly cursor = 'default';

  private mode: SelectionMode = 'idle';
  private startPoint: Vector2 | null = null;
  private marqueeRect: Rect | null = null;
  private moveStartPositions: Map<string, Vector2> = new Map();

  // Resize/rotation infrastructure
  private selectionManager: SelectionManager;
  private transformHandles: TransformHandles;
  private resizeState: ResizeState | null = null;
  private rotationState: RotationState | null = null;
  private currentCursor: string = 'default';

  constructor(context: ToolContext) {
    super(context);
    this.selectionManager = new SelectionManager();
    this.transformHandles = new TransformHandles();
  }

  /**
   * Get the current cursor (may change based on handle hover)
   */
  getCursor(): string {
    return this.currentCursor;
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    const worldPos = { ...event.worldPosition };
    const screenPos = { ...event.screenPosition };
    this.startPoint = worldPos;
    this.state.startWorldPos = worldPos;

    // First, check if clicking on a transform handle (if there's a selection)
    const selectedIds = this.context.getSelectedIds();
    if (selectedIds.size > 0) {
      const displayResult = this.selectionManager.getSelectionBoundsForDisplay(
        selectedIds,
        this.context.sceneGraph
      );

      if (displayResult) {
        const { bounds, rotation } = displayResult;
        const hitHandle = this.transformHandles.hitTest(
          screenPos,
          bounds,
          this.context.camera,
          rotation
        );

        if (hitHandle === 'rotation') {
          // Start rotation operation
          this.mode = 'rotating';
          this.state.isDragging = true;

          // Calculate initial angle from center to mouse
          const initialAngle = Math.atan2(
            worldPos.y - bounds.center.y,
            worldPos.x - bounds.center.x
          );

          // Capture initial rotations of all selected nodes
          const initialRotations = new Map<string, number>();
          for (const id of selectedIds) {
            const node = this.context.sceneGraph.getNode(id);
            if (node) {
              initialRotations.set(id, node.transform.rotation);
            }
          }

          this.rotationState = {
            initialBounds: bounds,
            initialAngle,
            initialRotations,
          };
          return;
        } else if (hitHandle) {
          // Start resize operation
          this.mode = 'resizing';
          this.state.isDragging = true;
          this.resizeState = {
            handle: hitHandle,
            initialBounds: bounds,
            initialNodeStates: this.captureNodeStates(selectedIds),
          };
          return;
        }
      }
    }

    // Hit test to find node under cursor
    const hitNode = this.hitTest(worldPos);

    if (hitNode) {
      const selectedIds = this.context.getSelectedIds();
      const isAlreadySelected = selectedIds.has(hitNode.id);

      if (this.isAdditive(event)) {
        // Ctrl/Cmd+click: toggle selection
        if (isAlreadySelected) {
          // Remove from selection
          const newIds = [...selectedIds].filter((id) => id !== hitNode.id);
          this.context.setSelectedIds(newIds);
        } else {
          // Add to selection
          this.context.addToSelection(hitNode.id);
        }
      } else if (!isAlreadySelected) {
        // Click on unselected node: select only this node
        this.context.setSelectedIds([hitNode.id]);
      }

      // Start move mode
      this.mode = 'moving';
      this.state.isDragging = true;

      // Store initial positions of all selected nodes
      this.moveStartPositions.clear();
      const currentSelectedIds = this.context.getSelectedIds();
      for (const id of currentSelectedIds) {
        const node = this.context.sceneGraph.getNode(id);
        if (node) {
          this.moveStartPositions.set(id, { ...node.transform.position });
        }
      }
    } else {
      // Clicked on empty space
      if (!this.isAdditive(event)) {
        // Clear selection
        this.context.clearSelection();
      }

      // Start marquee selection
      this.mode = 'marquee';
      this.state.isDragging = true;
      this.marqueeRect = { x: worldPos.x, y: worldPos.y, width: 0, height: 0 };
    }
  }

  onPointerMove(event: CanvasPointerEvent): void {
    // Update cursor based on handle hover when not dragging
    if (!this.state.isDragging) {
      this.updateCursorForHover(event.screenPosition);
    }

    if (!this.state.isDragging || !this.startPoint) return;

    const worldPos = { ...event.worldPosition };
    this.state.currentWorldPos = worldPos;

    if (this.mode === 'resizing' && this.resizeState) {
      this.performResize(worldPos, event.shiftKey, event.altKey);
      return;
    }

    if (this.mode === 'rotating' && this.rotationState) {
      this.performRotation(worldPos, event.shiftKey);
      return;
    }

    if (this.mode === 'moving') {
      // Move selected nodes
      const delta = vec2.subtract(worldPos, this.startPoint);

      for (const [id, startPos] of this.moveStartPositions) {
        const node = this.context.sceneGraph.getNode(id);
        if (node) {
          const rawPos = vec2.add(startPos, delta);
          const newPos = this.snapNodePosition(node, rawPos);
          this.context.sceneGraph.updateNode(id, {
            transform: {
              ...node.transform,
              position: newPos,
            },
          });
        }
      }
    } else if (this.mode === 'marquee') {
      // Update marquee rectangle
      this.marqueeRect = rect.fromPoints(this.startPoint, worldPos);
    }
  }

  onPointerUp(event: CanvasPointerEvent): void {
    const selectedIds = this.context.getSelectedIds();

    if (this.mode === 'moving' && this.moveStartPositions.size > 0) {
      // Move completed - notify for auto-keyframe
      this.context.onTransformComplete?.(selectedIds, 'move');
    } else if (this.mode === 'resizing') {
      // Resize completed - state already updated
      this.context.onTransformComplete?.(selectedIds, 'resize');
      this.resizeState = null;
    } else if (this.mode === 'rotating') {
      // Rotation completed - state already updated
      this.context.onTransformComplete?.(selectedIds, 'rotate');
      this.rotationState = null;
    } else if (this.mode === 'marquee' && this.startPoint) {
      // Update marquee rect with final position
      this.marqueeRect = rect.fromPoints(this.startPoint, event.worldPosition);

      // Select all nodes within marquee
      const nodesInMarquee = this.getNodesInRect(this.marqueeRect);

      if (this.isAdditive(event)) {
        // Add to existing selection
        for (const node of nodesInMarquee) {
          this.context.addToSelection(node.id);
        }
      } else if (nodesInMarquee.length > 0) {
        // Replace selection
        this.context.setSelectedIds(nodesInMarquee.map((n) => n.id));
      }
    }

    // Reset state
    this.mode = 'idle';
    this.startPoint = null;
    this.marqueeRect = null;
    this.moveStartPositions.clear();
    this.state.isDragging = false;
    this.currentCursor = 'default';
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    const selectedIds = this.context.getSelectedIds();

    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        // Delete selected nodes
        for (const id of selectedIds) {
          this.context.sceneGraph.removeNode(id);
        }
        this.context.clearSelection();
        break;

      case 'Escape':
        // Cancel current operation or clear selection
        if (this.mode === 'moving' && this.state.isDragging) {
          // Revert move
          for (const [id, startPos] of this.moveStartPositions) {
            const node = this.context.sceneGraph.getNode(id);
            if (node) {
              this.context.sceneGraph.updateNode(id, {
                transform: {
                  ...node.transform,
                  position: startPos,
                },
              });
            }
          }
          this.mode = 'idle';
          this.state.isDragging = false;
          this.moveStartPositions.clear();
        } else if (this.mode === 'resizing' && this.resizeState) {
          // Revert resize to initial node states
          for (const [id, initialState] of this.resizeState.initialNodeStates) {
            const node = this.context.sceneGraph.getNode(id);
            if (!node) continue;

            const updates: Record<string, unknown> = {
              transform: {
                ...node.transform,
                position: initialState.position,
                ...(initialState.scale ? { scale: initialState.scale } : {}),
              },
            };
            if (initialState.width !== undefined) updates.width = initialState.width;
            if (initialState.height !== undefined) updates.height = initialState.height;
            if (initialState.radiusX !== undefined) updates.radiusX = initialState.radiusX;
            if (initialState.radiusY !== undefined) updates.radiusY = initialState.radiusY;
            if (initialState.radius !== undefined) updates.radius = initialState.radius;

            this.context.sceneGraph.updateNode(id, updates as Partial<Node>);
          }
          this.resizeState = null;
          this.mode = 'idle';
          this.state.isDragging = false;
        } else if (this.mode === 'rotating' && this.rotationState) {
          // Revert rotation to initial rotations
          for (const [id, initialRotation] of this.rotationState.initialRotations) {
            const node = this.context.sceneGraph.getNode(id);
            if (node) {
              this.context.sceneGraph.updateNode(id, {
                transform: {
                  ...node.transform,
                  rotation: initialRotation,
                },
              });
            }
          }
          this.rotationState = null;
          this.mode = 'idle';
          this.state.isDragging = false;
        } else if (this.mode === 'marquee') {
          // Cancel marquee selection
          this.marqueeRect = null;
          this.startPoint = null;
          this.mode = 'idle';
          this.state.isDragging = false;
        } else {
          this.context.clearSelection();
        }
        break;

      case 'a':
        if (event.ctrlKey || event.metaKey) {
          // Select all
          event.preventDefault();
          const allIds: string[] = [];
          this.context.sceneGraph.traverse((node) => {
            allIds.push(node.id);
          });
          this.context.setSelectedIds(allIds);
        }
        break;

      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        // Nudge selected nodes
        event.preventDefault();
        const snapOn = this.context.getSnapToGrid?.() ?? false;
        const gridSize = this.context.getGridSize?.() ?? 20;
        const nudgeAmount = snapOn ? gridSize : event.shiftKey ? 10 : 1;
        const delta = this.getArrowDelta(event.key, nudgeAmount);

        for (const id of selectedIds) {
          const node = this.context.sceneGraph.getNode(id);
          if (node) {
            const rawPos = vec2.add(node.transform.position, delta);
            const newPos = snapOn ? this.snapNodePosition(node, rawPos) : rawPos;
            this.context.sceneGraph.updateNode(id, {
              transform: {
                ...node.transform,
                position: newPos,
              },
            });
          }
        }
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Hit Testing
  // --------------------------------------------------------------------------

  /**
   * Find the topmost node at the given world position
   */
  hitTest(worldPoint: Vector2): Node | null {
    let hitNode: Node | null = null;

    // Traverse in reverse order (top to bottom in render order)
    this.context.sceneGraph.traverseVisible((node) => {
      if (this.isPointInNode(worldPoint, node)) {
        hitNode = node;
      }
    });

    return hitNode;
  }

  /**
   * Check if a point is inside a node's bounds
   */
  private isPointInNode(point: Vector2, node: Node): boolean {
    const bounds = this.getNodeBounds(node);
    if (!bounds) return false;

    // For paths, expand the bounds by a hit tolerance to make thin paths easier to select
    if (node.type === 'path') {
      const hitTolerance = 8 / this.context.camera.zoom; // 8 screen pixels
      const expandedBounds = {
        x: bounds.x - hitTolerance,
        y: bounds.y - hitTolerance,
        width: Math.max(bounds.width, hitTolerance * 2) + hitTolerance * 2,
        height: Math.max(bounds.height, hitTolerance * 2) + hitTolerance * 2,
      };
      return rect.contains(expandedBounds, point);
    }

    return rect.contains(bounds, point);
  }

  /**
   * Get the axis-aligned bounding box of a node in world space
   */
  private getNodeBounds(node: Node): Rect | null {
    const transform = node.transform;

    // Get local-space AABB (geometry centered at local origin)
    let localBounds: Rect | null = null;

    switch (node.type) {
      case 'rectangle': {
        const anchor = transform.anchor;
        localBounds = {
          x: -node.width * anchor.x,
          y: -node.height * anchor.y,
          width: node.width,
          height: node.height,
        };
        break;
      }
      case 'ellipse': {
        localBounds = {
          x: -node.radiusX,
          y: -node.radiusY,
          width: node.radiusX * 2,
          height: node.radiusY * 2,
        };
        break;
      }
      case 'polygon': {
        localBounds = getPolygonBounds(0, 0, node.radius, node.sides, 1, 1, node.innerRadius);
        break;
      }
      case 'path': {
        localBounds = getPathBounds(node.points, node.closed);
        break;
      }
      default:
        return null;
    }

    if (!localBounds) return null;

    // Build world matrix for bounds (skip anchor offset since local geometry
    // already accounts for it via explicit offsets like -width*anchor.x)
    const worldMatrix = mat3.compose(transform.position, transform.rotation, transform.scale);

    return transformBoundsToWorld(localBounds, worldMatrix);
  }

  /**
   * Get all nodes that intersect with the given rectangle
   */
  private getNodesInRect(selectionRect: Rect): Node[] {
    const result: Node[] = [];
    const hitTolerance = 8 / this.context.camera.zoom; // 8 screen pixels

    this.context.sceneGraph.traverseVisible((node) => {
      let bounds = this.getNodeBounds(node);
      if (!bounds) return;

      // For paths, expand bounds to make thin paths easier to marquee select
      if (node.type === 'path') {
        bounds = {
          x: bounds.x - hitTolerance,
          y: bounds.y - hitTolerance,
          width: Math.max(bounds.width, hitTolerance * 2) + hitTolerance * 2,
          height: Math.max(bounds.height, hitTolerance * 2) + hitTolerance * 2,
        };
      }

      if (rect.intersects(selectionRect, bounds)) {
        result.push(node);
      }
    });

    return result;
  }

  // --------------------------------------------------------------------------
  // Public Accessors
  // --------------------------------------------------------------------------

  /**
   * Get the current marquee rectangle (for rendering)
   */
  getMarqueeRect(): Rect | null {
    return this.marqueeRect;
  }

  /**
   * Get current selection mode
   */
  getMode(): SelectionMode {
    return this.mode;
  }

  // --------------------------------------------------------------------------
  // Snap Helpers
  // --------------------------------------------------------------------------

  private snapValue(value: number): number {
    if (!this.context.getSnapToGrid?.()) return value;
    const grid = this.context.getGridSize?.() ?? 20;
    return Math.round(value / grid) * grid;
  }

  private snapPosition(pos: Vector2): Vector2 {
    if (!this.context.getSnapToGrid?.()) return pos;
    return { x: this.snapValue(pos.x), y: this.snapValue(pos.y) };
  }

  /**
   * Snap a node's center position so that its top-left corner aligns with the grid.
   * Falls back to plain center snap for nodes with unknown dimensions.
   */
  private snapNodePosition(node: Node, centerPos: Vector2): Vector2 {
    if (!this.context.getSnapToGrid?.()) return centerPos;

    const size = this.getNodeBoundsSize(node);
    if (size.width === 0 && size.height === 0) {
      return this.snapPosition(centerPos);
    }

    const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
    // Compute top-left from center
    const topLeft = {
      x: centerPos.x - size.width * anchor.x,
      y: centerPos.y - size.height * anchor.y,
    };
    // Snap top-left to grid
    const snappedTL = this.snapPosition(topLeft);
    // Convert back to center
    return {
      x: snappedTL.x + size.width * anchor.x,
      y: snappedTL.y + size.height * anchor.y,
    };
  }

  /** Get bounding box dimensions for a node (used for snap offset). */
  private getNodeBoundsSize(node: Node): { width: number; height: number } {
    switch (node.type) {
      case 'rectangle':
        return {
          width: (node as { width: number }).width,
          height: (node as { height: number }).height,
        };
      case 'ellipse':
        return {
          width: (node as { radiusX: number }).radiusX * 2,
          height: (node as { radiusY: number }).radiusY * 2,
        };
      case 'polygon': {
        const p = node as { radius: number; transform: { scale?: Vector2 } };
        const sx = p.transform.scale?.x ?? 1;
        const sy = p.transform.scale?.y ?? 1;
        return { width: p.radius * 2 * sx, height: p.radius * 2 * sy };
      }
      default:
        return { width: 0, height: 0 };
    }
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getArrowDelta(key: string, amount: number): Vector2 {
    switch (key) {
      case 'ArrowUp':
        return { x: 0, y: -amount };
      case 'ArrowDown':
        return { x: 0, y: amount };
      case 'ArrowLeft':
        return { x: -amount, y: 0 };
      case 'ArrowRight':
        return { x: amount, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  }

  // --------------------------------------------------------------------------
  // Resize Helpers
  // --------------------------------------------------------------------------

  /**
   * Capture initial state of nodes for resize operation
   */
  private captureNodeStates(selectedIds: Set<string>): Map<string, NodeResizeState> {
    const states = new Map<string, NodeResizeState>();

    for (const id of selectedIds) {
      const node = this.context.sceneGraph.getNode(id);
      if (!node) continue;

      const state: NodeResizeState = {
        position: { ...node.transform.position },
      };

      if (node.type === 'rectangle') {
        state.width = node.width;
        state.height = node.height;
      } else if (node.type === 'ellipse') {
        state.radiusX = node.radiusX;
        state.radiusY = node.radiusY;
      } else if (node.type === 'polygon') {
        state.radius = node.radius;
        state.scale = { ...node.transform.scale };
      }

      states.set(id, state);
    }

    return states;
  }

  /**
   * Update cursor based on handle hover
   */
  private updateCursorForHover(screenPos: Vector2): void {
    const selectedIds = this.context.getSelectedIds();
    if (selectedIds.size === 0) {
      this.currentCursor = 'default';
      return;
    }

    const displayResult = this.selectionManager.getSelectionBoundsForDisplay(
      selectedIds,
      this.context.sceneGraph
    );

    if (!displayResult) {
      this.currentCursor = 'default';
      return;
    }

    const { bounds, rotation } = displayResult;
    const hitHandle = this.transformHandles.hitTest(
      screenPos,
      bounds,
      this.context.camera,
      rotation
    );

    if (hitHandle) {
      this.currentCursor = this.transformHandles.getCursor(hitHandle);
    } else {
      this.currentCursor = 'default';
    }
  }

  /**
   * Perform resize operation based on current drag position
   */
  private performResize(
    worldPos: Vector2,
    constrained: boolean,
    fromCenter: boolean = false
  ): void {
    if (!this.resizeState || !this.startPoint) return;

    const { handle, initialBounds, initialNodeStates } = this.resizeState;
    const delta = vec2.subtract(worldPos, this.startPoint);

    // Calculate new bounds based on handle position
    const newBounds = this.calculateNewBounds(
      initialBounds.rect,
      handle,
      delta,
      constrained,
      fromCenter
    );

    // Calculate scale factors
    const scaleX = initialBounds.rect.width > 0 ? newBounds.width / initialBounds.rect.width : 1;
    const scaleY = initialBounds.rect.height > 0 ? newBounds.height / initialBounds.rect.height : 1;

    // Apply to each selected node
    for (const [id, initialState] of initialNodeStates) {
      const node = this.context.sceneGraph.getNode(id);
      if (!node) continue;

      // Calculate new position relative to new bounds
      const relX =
        initialBounds.rect.width > 0
          ? (initialState.position.x - initialBounds.rect.x) / initialBounds.rect.width
          : 0;
      const relY =
        initialBounds.rect.height > 0
          ? (initialState.position.y - initialBounds.rect.y) / initialBounds.rect.height
          : 0;

      const newPosition = {
        x: newBounds.x + relX * newBounds.width,
        y: newBounds.y + relY * newBounds.height,
      };

      if (
        node.type === 'rectangle' &&
        initialState.width !== undefined &&
        initialState.height !== undefined
      ) {
        const newWidth = Math.max(1, initialState.width * scaleX);
        const newHeight = Math.max(1, initialState.height * scaleY);

        this.context.sceneGraph.updateNode(id, {
          transform: { ...node.transform, position: newPosition },
          width: newWidth,
          height: newHeight,
        });
      } else if (
        node.type === 'ellipse' &&
        initialState.radiusX !== undefined &&
        initialState.radiusY !== undefined
      ) {
        const newRadiusX = Math.max(1, initialState.radiusX * scaleX);
        const newRadiusY = Math.max(1, initialState.radiusY * scaleY);

        this.context.sceneGraph.updateNode(id, {
          transform: { ...node.transform, position: newPosition },
          radiusX: newRadiusX,
          radiusY: newRadiusY,
        });
      } else if (
        node.type === 'polygon' &&
        initialState.radius !== undefined &&
        initialState.scale !== undefined
      ) {
        // For polygons, apply non-uniform scaling via transform scale
        // This allows stretching/squishing the polygon
        const newScaleX = Math.max(0.01, initialState.scale.x * scaleX);
        const newScaleY = Math.max(0.01, initialState.scale.y * scaleY);

        this.context.sceneGraph.updateNode(id, {
          transform: {
            ...node.transform,
            position: newPosition,
            scale: { x: newScaleX, y: newScaleY },
          },
        });
      }
    }
  }

  /**
   * Perform rotation operation based on current drag position
   */
  private performRotation(worldPos: Vector2, constrained: boolean): void {
    if (!this.rotationState) return;

    const { initialBounds, initialAngle, initialRotations } = this.rotationState;

    // Calculate current angle from center to mouse
    const currentAngle = Math.atan2(
      worldPos.y - initialBounds.center.y,
      worldPos.x - initialBounds.center.x
    );

    // Calculate rotation delta (radians to degrees)
    let deltaRotation = (currentAngle - initialAngle) * (180 / Math.PI);

    // Constrain to 15-degree increments when shift is held
    if (constrained) {
      deltaRotation = Math.round(deltaRotation / 15) * 15;
    }

    // Apply rotation to each selected node
    for (const [id, initialRotation] of initialRotations) {
      const node = this.context.sceneGraph.getNode(id);
      if (!node) continue;

      const newRotation = initialRotation + deltaRotation;

      this.context.sceneGraph.updateNode(id, {
        transform: {
          ...node.transform,
          rotation: newRotation,
        },
      });
    }
  }

  /**
   * Calculate new bounds based on handle drag
   */
  private calculateNewBounds(
    initial: Rect,
    handle: HandlePosition,
    delta: Vector2,
    constrained: boolean,
    fromCenter: boolean = false
  ): Rect {
    let { x, y, width, height } = initial;

    // Apply delta based on which handle is being dragged
    switch (handle) {
      case 'top-left':
        x += delta.x;
        y += delta.y;
        width -= delta.x;
        height -= delta.y;
        break;
      case 'top':
        y += delta.y;
        height -= delta.y;
        break;
      case 'top-right':
        y += delta.y;
        width += delta.x;
        height -= delta.y;
        break;
      case 'right':
        width += delta.x;
        break;
      case 'bottom-right':
        width += delta.x;
        height += delta.y;
        break;
      case 'bottom':
        height += delta.y;
        break;
      case 'bottom-left':
        x += delta.x;
        width -= delta.x;
        height += delta.y;
        break;
      case 'left':
        x += delta.x;
        width -= delta.x;
        break;
    }

    // Apply constraint (maintain aspect ratio)
    if (constrained) {
      const initialAspect = initial.width / initial.height;
      const currentAspect = width / height;

      if (currentAspect > initialAspect) {
        // Width is larger proportionally, adjust height
        const newHeight = width / initialAspect;
        if (handle.includes('top')) {
          y -= newHeight - height;
        }
        height = newHeight;
      } else {
        // Height is larger proportionally, adjust width
        const newWidth = height * initialAspect;
        if (handle.includes('left')) {
          x -= newWidth - width;
        }
        width = newWidth;
      }
    }

    // Alt key: resize from center (double the delta symmetrically)
    if (fromCenter) {
      const centerX = initial.x + initial.width / 2;
      const centerY = initial.y + initial.height / 2;
      const dw = width - initial.width;
      const dh = height - initial.height;
      width = initial.width + dw * 2;
      height = initial.height + dh * 2;
      x = centerX - width / 2;
      y = centerY - height / 2;
    }

    // Ensure minimum size
    const minSize = 1;
    if (width < minSize) {
      if (fromCenter) {
        const centerX = initial.x + initial.width / 2;
        x = centerX - minSize / 2;
      } else if (handle.includes('left')) {
        x = initial.x + initial.width - minSize;
      }
      width = minSize;
    }
    if (height < minSize) {
      if (fromCenter) {
        const centerY = initial.y + initial.height / 2;
        y = centerY - minSize / 2;
      } else if (handle.includes('top')) {
        y = initial.y + initial.height - minSize;
      }
      height = minSize;
    }

    return { x, y, width, height };
  }

  /**
   * Reset all transient state when tool is deactivated
   */
  onDeactivate(): void {
    this.mode = 'idle';
    this.startPoint = null;
    this.marqueeRect = null;
    this.moveStartPositions.clear();
    this.resizeState = null;
    this.rotationState = null;
    this.currentCursor = 'default';
  }
}
