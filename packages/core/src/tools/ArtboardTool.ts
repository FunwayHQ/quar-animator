/**
 * Artboard Tool for Quar Animator
 * Creates artboard frames by dragging (like Figma frames)
 */

import type { CanvasPointerEvent, ArtboardNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';

// ============================================================================
// ArtboardTool Class
// ============================================================================

export class ArtboardTool extends BaseTool {
  readonly type = 'artboard' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: ArtboardNode | null = null;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.state.startWorldPos = { ...event.worldPosition };

    this.previewNode = this.createArtboardNode(event.worldPosition.x, event.worldPosition.y, 0, 0);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    this.state.currentWorldPos = { ...event.worldPosition };

    const rect = this.getRectFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

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

    const rect = this.getRectFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    if (rect.width >= this.getMinimumSize() && rect.height >= this.getMinimumSize()) {
      const node = this.createArtboardNode(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width,
        rect.height
      );

      this.context.onTransformStart?.();
      this.context.sceneGraph.addNode(node);
      this.context.setSelectedIds([node.id]);
      this.context.setActiveTool('selection');
    }

    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.isDragging) {
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): ArtboardNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private createArtboardNode(cx: number, cy: number, width: number, height: number): ArtboardNode {
    const transform = createDefaultTransform();
    transform.position = { x: cx, y: cy };
    transform.anchor = { x: 0.5, y: 0.5 };
    transform.rotation = 0;

    return {
      id: this.context.generateId(),
      name: 'Artboard',
      type: 'artboard',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width,
      height,
      fills: [
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1, visible: true },
      ],
      clipContent: true,
    };
  }
}
