/**
 * Ellipse Tool for Quar Animator
 * Creates ellipse/circle shapes by dragging
 */

import type { CanvasPointerEvent, EllipseNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';

// ============================================================================
// EllipseTool Class
// ============================================================================

export class EllipseTool extends BaseTool {
  readonly type = 'ellipse' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: EllipseNode | null = null;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.state.startWorldPos = { ...event.worldPosition };

    // Create preview node
    this.previewNode = this.createEllipseNode(event.worldPosition.x, event.worldPosition.y, 0, 0);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    this.state.currentWorldPos = { ...event.worldPosition };

    // Calculate ellipse dimensions
    const ellipse = this.getEllipseFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    // Update preview node
    this.previewNode.transform.position = { x: ellipse.cx, y: ellipse.cy };
    this.previewNode.radiusX = ellipse.radiusX;
    this.previewNode.radiusY = ellipse.radiusY;
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.resetState();
      return;
    }

    // Calculate final ellipse dimensions
    const ellipse = this.getEllipseFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    // Only create if meets minimum size
    if (
      ellipse.radiusX >= this.getMinimumSize() / 2 &&
      ellipse.radiusY >= this.getMinimumSize() / 2
    ) {
      const node = this.createEllipseNode(ellipse.cx, ellipse.cy, ellipse.radiusX, ellipse.radiusY);

      // Add to scene graph
      this.context.sceneGraph.addNode(node);

      // Select the new node
      this.context.setSelectedIds([node.id]);

      // Switch to selection tool
      this.context.setActiveTool('selection');
    }

    // Reset state
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.isDragging) {
      // Cancel drawing
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): EllipseNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private getEllipseFromPoints(
    start: Vector2,
    end: Vector2,
    constrained: boolean,
    fromCenter: boolean
  ): { cx: number; cy: number; radiusX: number; radiusY: number } {
    let width = end.x - start.x;
    let height = end.y - start.y;

    if (constrained) {
      // Constrain to circle
      const size = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width) * size || size;
      height = Math.sign(height) * size || size;
    }

    if (fromCenter) {
      // Draw from center
      return {
        cx: start.x,
        cy: start.y,
        radiusX: Math.abs(width),
        radiusY: Math.abs(height),
      };
    }

    // Draw from corner (ellipse inscribed in bounding box)
    return {
      cx: start.x + width / 2,
      cy: start.y + height / 2,
      radiusX: Math.abs(width) / 2,
      radiusY: Math.abs(height) / 2,
    };
  }

  private createEllipseNode(cx: number, cy: number, radiusX: number, radiusY: number): EllipseNode {
    const transform = createDefaultTransform();
    transform.position = { x: cx, y: cy };
    transform.anchor = { x: 0.5, y: 0.5 };

    return {
      id: this.context.generateId(),
      name: 'Ellipse',
      type: 'ellipse',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      radiusX,
      radiusY,
      fills: [this.context.defaultFill],
      strokes: [this.context.defaultStroke],
    };
  }
}
