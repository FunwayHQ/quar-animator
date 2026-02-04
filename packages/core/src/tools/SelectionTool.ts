/**
 * Selection Tool for Quar Animator
 * Selects and moves shapes
 */

import type { CanvasPointerEvent, Node, Vector2, Rect } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, rect } from '../math';

// ============================================================================
// Types
// ============================================================================

type SelectionMode = 'idle' | 'selecting' | 'moving' | 'marquee';

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
    this.startPoint = worldPos;
    this.state.startWorldPos = worldPos;

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
    if (!this.state.isDragging || !this.startPoint) return;

    const worldPos = { ...event.worldPosition };
    this.state.currentWorldPos = worldPos;

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
    if (this.mode === 'marquee' && this.startPoint) {
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
      case 'ArrowRight':
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
        const rectNode = node as any;
        const halfWidth = rectNode.width / 2;
        const halfHeight = rectNode.height / 2;
        return {
          x: pos.x - halfWidth,
          y: pos.y - halfHeight,
          width: rectNode.width,
          height: rectNode.height,
        };
      }
      case 'ellipse': {
        const ellipseNode = node as any;
        return {
          x: pos.x - ellipseNode.radiusX,
          y: pos.y - ellipseNode.radiusY,
          width: ellipseNode.radiusX * 2,
          height: ellipseNode.radiusY * 2,
        };
      }
      case 'path': {
        const pathNode = node as any;
        if (pathNode.points.length === 0) return null;

        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        for (const p of pathNode.points) {
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
}
