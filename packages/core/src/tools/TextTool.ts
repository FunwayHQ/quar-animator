/**
 * Text Tool for Quar Animator
 * Works like Figma's: a click starts auto width text, which grows to fit what
 * is typed; a drag draws a fixed size box the text wraps in. Either way the
 * new text opens for inline editing.
 */

import type { CanvasPointerEvent, RectangleNode, TextNode, Vector2 } from '@quar/types';
import { BaseTool } from './BaseTool';
import { getTextLocalBounds } from '../font/textPlacement';

/** Drags shorter than this many screen pixels are clicks. */
const DRAG_THRESHOLD_PX = 4;

const DEFAULT_FONT_SIZE = 24;
const DEFAULT_LINE_HEIGHT = 1.2;

export class TextTool extends BaseTool {
  readonly type = 'text' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  /** Outline of the box being dragged out. */
  private previewNode: RectangleNode | null = null;

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.state.startWorldPos = { ...event.worldPosition };
    this.previewNode = null;
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) return;

    this.state.currentWorldPos = { ...event.worldPosition };
    const rect = this.getRectFromPoints(this.startPoint, event.worldPosition, false, false);
    this.previewNode = this.isDrag(rect) ? this.createBoxOutline(rect) : null;
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.reset();
      return;
    }

    const rect = this.getRectFromPoints(this.startPoint, event.worldPosition, false, false);
    const node = this.isDrag(rect)
      ? this.createFixedText(rect)
      : this.createAutoWidthText(this.startPoint);

    // Add to scene graph
    this.context.onTransformStart?.();
    this.context.sceneGraph.addNode(node);
    this.context.setSelectedIds([node.id]);

    // Trigger inline text editing
    this.context.onEnterTextEdit?.(node.id);

    // Stay on the text tool — don't switch to selection
    this.reset();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.isDragging) {
      this.reset();
    }
  }

  onDeactivate(): void {
    this.reset();
  }

  getPreviewNode(): RectangleNode | null {
    return this.previewNode;
  }

  private reset(): void {
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  /** Whether the pointer moved far enough, on screen, to draw a box. */
  private isDrag(rect: { width: number; height: number }): boolean {
    const threshold = DRAG_THRESHOLD_PX / this.context.camera.zoom;
    return rect.width >= threshold || rect.height >= threshold;
  }

  /** Auto width text whose top left corner is at the click. */
  private createAutoWidthText(topLeft: Vector2): TextNode {
    const node = this.createTextNode(topLeft);
    const box = getTextLocalBounds(node);
    node.transform.position = { x: topLeft.x - box.x, y: topLeft.y - (box.y + box.height) };
    return node;
  }

  /** Fixed size text filling the dragged box, at least one line tall. */
  private createFixedText(rect: { x: number; y: number; width: number; height: number }): TextNode {
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT);
    // Y-up: the box hangs down from the top of the drag
    const top = rect.y + rect.height;
    const node = this.createTextNode({ x: rect.x + width / 2, y: top - height / 2 });
    node.textResize = 'fixed';
    node.boxWidth = width;
    node.boxHeight = height;
    return node;
  }

  private createTextNode(position: Vector2): TextNode {
    return {
      id: this.context.generateId(),
      name: 'Text',
      type: 'text',
      parent: null,
      children: [],
      transform: {
        position: { ...position },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      content: '',
      fontFamily: 'Inter',
      fontSize: DEFAULT_FONT_SIZE,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: DEFAULT_LINE_HEIGHT,
      letterSpacing: 0,
      textResize: 'auto-width',
      fills: [{ ...this.context.defaultFill }],
      strokes: [{ ...this.context.defaultStroke, visible: false }],
    };
  }

  /** A hairline rectangle showing the box while it's dragged out. */
  private createBoxOutline(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): RectangleNode {
    return {
      id: 'text-box-preview',
      name: 'Text box',
      type: 'rectangle',
      parent: null,
      children: [],
      transform: {
        position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: Math.max(rect.width, 1 / this.context.camera.zoom),
      height: Math.max(rect.height, 1 / this.context.camera.zoom),
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [
        {
          color: { r: 168, g: 85, b: 247, a: 1 },
          width: 1 / this.context.camera.zoom,
          opacity: 1,
          cap: 'butt',
          join: 'miter',
          visible: true,
        },
      ],
    };
  }
}
