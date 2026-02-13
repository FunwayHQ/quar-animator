/**
 * Text Tool for Quar Animator
 * Click-and-drag to define a text box, then enter inline editing.
 * A simple click (no drag) creates a default-sized text node.
 */

import type { CanvasPointerEvent, TextNode, Vector2 } from '@quar/types';
import { BaseTool } from './BaseTool';

export class TextTool extends BaseTool {
  readonly type = 'text' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: TextNode | null = null;

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.state.startWorldPos = { ...event.worldPosition };

    // Create preview node at click point with zero size
    this.previewNode = this.createTextNode(event.worldPosition.x, event.worldPosition.y, 0, 0);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    this.state.currentWorldPos = { ...event.worldPosition };

    // Calculate text box dimensions from drag
    const rect = this.getRectFromPoints(this.startPoint, event.worldPosition, false, false);

    this.previewNode.transform.position = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    this.previewNode.transform.scale = {
      x: Math.max(rect.width / 100, 0.01),
      y: Math.max(rect.height / 100, 0.01),
    };
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
      return;
    }

    const rect = this.getRectFromPoints(this.startPoint, event.worldPosition, false, false);

    // If the drag was large enough, create a sized text box
    // Otherwise (simple click), create a default text node
    const hasDragged = rect.width >= this.getMinimumSize() && rect.height >= this.getMinimumSize();

    const node = hasDragged
      ? this.createTextNode(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width,
          rect.height
        )
      : this.createTextNode(this.startPoint.x, this.startPoint.y, 0, 0);

    // Add to scene graph
    this.context.onTransformStart?.();
    this.context.sceneGraph.addNode(node);
    this.context.setSelectedIds([node.id]);

    // Trigger inline text editing
    this.context.onEnterTextEdit?.(node.id);

    // Reset state (stay on text tool — don't switch to selection)
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.isDragging) {
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
    }
  }

  getPreviewNode(): TextNode | null {
    return this.previewNode;
  }

  private createTextNode(cx: number, cy: number, width: number, height: number): TextNode {
    // If width/height are specified, compute scale from a base font size
    const fontSize = 24;
    const scaleX = width > 0 ? width / 100 : 1;
    const scaleY = height > 0 ? height / 100 : 1;

    return {
      id: this.context.generateId(),
      name: 'Text',
      type: 'text',
      parent: null,
      children: [],
      transform: {
        position: { x: cx, y: cy },
        rotation: 0,
        scale: { x: scaleX, y: scaleY },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      content: '',
      fontFamily: 'Inter',
      fontSize,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [{ ...this.context.defaultFill }],
      strokes: [{ ...this.context.defaultStroke, visible: false }],
    };
  }
}
