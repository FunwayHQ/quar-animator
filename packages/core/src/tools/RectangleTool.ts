/**
 * Rectangle Tool for Quar Animator
 * Creates rectangle shapes by dragging
 */

import type { CanvasPointerEvent, RectangleNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';

// ============================================================================
// RectangleTool Class
// ============================================================================

export class RectangleTool extends BaseTool {
  readonly type = 'rectangle' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: RectangleNode | null = null;

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
    this.previewNode = this.createRectangleNode(event.worldPosition.x, event.worldPosition.y, 0, 0);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    this.state.currentWorldPos = { ...event.worldPosition };

    // Calculate rectangle dimensions
    const rect = this.getRectFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    // Update preview node
    this.previewNode.transform.position = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    this.previewNode.width = rect.width;
    this.previewNode.height = rect.height;
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
      return;
    }

    // Calculate final rectangle dimensions
    const rect = this.getRectFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    // Only create if meets minimum size
    if (rect.width >= this.getMinimumSize() && rect.height >= this.getMinimumSize()) {
      const node = this.createRectangleNode(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width,
        rect.height
      );

      // Add to scene graph
      this.context.onTransformStart?.();
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

  onDeactivate(): void {
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): RectangleNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private createRectangleNode(
    cx: number,
    cy: number,
    width: number,
    height: number
  ): RectangleNode {
    const transform = createDefaultTransform();
    transform.position = { x: cx, y: cy };
    transform.anchor = { x: 0.5, y: 0.5 };

    return {
      id: this.context.generateId(),
      name: 'Rectangle',
      type: 'rectangle',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width,
      height,
      cornerRadius: [0, 0, 0, 0],
      fills: [this.context.defaultFill],
      strokes: [this.context.defaultStroke],
    };
  }
}
