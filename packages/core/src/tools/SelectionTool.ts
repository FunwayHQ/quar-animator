/**
 * Selection Tool for Quar Animator
 * Selects, moves, and resizes shapes
 */

import type { CanvasPointerEvent, Node, Vector2, Rect } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, rect } from '../math';
import { SelectionManager } from '../selection/SelectionManager';
import { TransformHandles } from '../selection/TransformHandles';
import type { HandlePosition, SelectionBounds } from '../selection/types';
import { getPolygonBounds } from '../path/pathUtils';

// ============================================================================
// Types
// ============================================================================

type SelectionMode = 'idle' | 'selecting' | 'moving' | 'marquee' | 'resizing';

interface ResizeState {
  handle: HandlePosition;
  initialBounds: SelectionBounds;
  initialNodeStates: Map<string, NodeResizeState>;
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

  // Resize infrastructure
  private selectionManager: SelectionManager;
  private transformHandles: TransformHandles;
  private resizeState: ResizeState | null = null;
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
      const bounds = this.selectionManager.getSelectionBounds(selectedIds, this.context.sceneGraph);

      if (bounds) {
        const hitHandle = this.transformHandles.hitTest(screenPos, bounds, this.context.camera);

        if (hitHandle && hitHandle !== 'rotation') {
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
      this.performResize(worldPos, event.shiftKey);
      return;
    }

    if (this.mode === 'moving') {
      // Move selected nodes
      const delta = vec2.subtract(worldPos, this.startPoint);

      for (const [id, startPos] of this.moveStartPositions) {
        const node = this.context.sceneGraph.getNode(id);
        if (node) {
          const newPos = vec2.add(startPos, delta);
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
    if (this.mode === 'resizing') {
      // Resize completed - state already updated
      this.resizeState = null;
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
        if (this.state.isDragging) {
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
        const nudgeAmount = event.shiftKey ? 10 : 1;
        const delta = this.getArrowDelta(event.key, nudgeAmount);

        for (const id of selectedIds) {
          const node = this.context.sceneGraph.getNode(id);
          if (node) {
            const newPos = vec2.add(node.transform.position, delta);
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

    return rect.contains(bounds, point);
  }

  /**
   * Get the axis-aligned bounding box of a node in world space
   */
  private getNodeBounds(node: Node): Rect | null {
    const transform = node.transform;
    const pos = transform.position;

    switch (node.type) {
      case 'rectangle': {
        const halfWidth = node.width / 2;
        const halfHeight = node.height / 2;
        return {
          x: pos.x - halfWidth,
          y: pos.y - halfHeight,
          width: node.width,
          height: node.height,
        };
      }
      case 'ellipse': {
        return {
          x: pos.x - node.radiusX,
          y: pos.y - node.radiusY,
          width: node.radiusX * 2,
          height: node.radiusY * 2,
        };
      }
      case 'polygon': {
        // Calculate precise bounds from actual polygon vertices
        const scaleX = transform.scale?.x ?? 1;
        const scaleY = transform.scale?.y ?? 1;
        return getPolygonBounds(
          pos.x,
          pos.y,
          node.radius,
          node.sides,
          scaleX,
          scaleY,
          node.innerRadius
        );
      }
      case 'path': {
        if (node.points.length === 0) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const p of node.points) {
          minX = Math.min(minX, p.position.x);
          minY = Math.min(minY, p.position.y);
          maxX = Math.max(maxX, p.position.x);
          maxY = Math.max(maxY, p.position.y);
        }

        return {
          x: minX + pos.x,
          y: minY + pos.y,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
      default:
        return null;
    }
  }

  /**
   * Get all nodes that intersect with the given rectangle
   */
  private getNodesInRect(selectionRect: Rect): Node[] {
    const result: Node[] = [];

    this.context.sceneGraph.traverseVisible((node) => {
      const bounds = this.getNodeBounds(node);
      if (bounds && rect.intersects(selectionRect, bounds)) {
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

    const bounds = this.selectionManager.getSelectionBounds(selectedIds, this.context.sceneGraph);

    if (!bounds) {
      this.currentCursor = 'default';
      return;
    }

    const hitHandle = this.transformHandles.hitTest(screenPos, bounds, this.context.camera);

    if (hitHandle) {
      this.currentCursor = this.transformHandles.getCursor(hitHandle);
    } else {
      this.currentCursor = 'default';
    }
  }

  /**
   * Perform resize operation based on current drag position
   */
  private performResize(worldPos: Vector2, constrained: boolean): void {
    if (!this.resizeState || !this.startPoint) return;

    const { handle, initialBounds, initialNodeStates } = this.resizeState;
    const delta = vec2.subtract(worldPos, this.startPoint);

    // Calculate new bounds based on handle position
    const newBounds = this.calculateNewBounds(initialBounds.rect, handle, delta, constrained);

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
   * Calculate new bounds based on handle drag
   */
  private calculateNewBounds(
    initial: Rect,
    handle: HandlePosition,
    delta: Vector2,
    constrained: boolean
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

    // Ensure minimum size
    const minSize = 1;
    if (width < minSize) {
      if (handle.includes('left')) {
        x = initial.x + initial.width - minSize;
      }
      width = minSize;
    }
    if (height < minSize) {
      if (handle.includes('top')) {
        y = initial.y + initial.height - minSize;
      }
      height = minSize;
    }

    return { x, y, width, height };
  }
}
