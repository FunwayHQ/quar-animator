/**
 * Artboard Tool for Quar Animator
 * Creates artboard frames by dragging (like Figma frames)
 */

import type { CanvasPointerEvent, ArtboardNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';
import { SelectionManager } from '../selection/SelectionManager';

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
      this.adoptContainedLayers(node);
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

  onDeactivate(): void {
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
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

  /**
   * Layers the new artboard was drawn around go into it, like a Figma frame
   * drawn around existing layers: every visible root layer whose bounds lie
   * entirely inside the artboard, in their stacking order. Layers partly
   * outside, layers inside groups, and other artboards stay where they are.
   */
  private adoptContainedLayers(artboard: ArtboardNode): void {
    const move = this.context.moveNodeKeepingPlacement;
    if (!move) return;
    const sceneGraph = this.context.sceneGraph;
    const bounds = new SelectionManager();
    const boundsOf = (id: string) => bounds.getSelectionBounds(new Set([id]), sceneGraph)?.rect;
    const frame = boundsOf(artboard.id);
    if (!frame) return;

    const EPSILON = 1e-6;
    const inside = (x: number, y: number) =>
      x >= frame.x - EPSILON &&
      y >= frame.y - EPSILON &&
      x <= frame.x + frame.width + EPSILON &&
      y <= frame.y + frame.height + EPSILON;
    const contained = sceneGraph.getRootNodes().filter((node) => {
      if (node.id === artboard.id || node.type === 'artboard' || !node.visible) return false;
      const rect = boundsOf(node.id);
      if (!rect) {
        // Point-like layers (IK targets) have no area: go by their position
        const world = sceneGraph.getWorldTransform(node.id);
        return inside(world.tx, world.ty);
      }
      return inside(rect.x, rect.y) && inside(rect.x + rect.width, rect.y + rect.height);
    });
    for (const node of contained) move(node.id, artboard.id);
  }

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
