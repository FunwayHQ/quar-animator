/**
 * Text Tool for Quar Animator
 * Creates TextNode on click, triggers inline text editing.
 */

import type { CanvasPointerEvent, TextNode } from '@quar/types';
import { BaseTool } from './BaseTool';

export class TextTool extends BaseTool {
  readonly type = 'text' as const;
  readonly cursor = 'text';

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    const worldPos = event.worldPosition;
    const id = this.context.generateId();

    const textNode: TextNode = {
      id,
      name: 'Text',
      type: 'text',
      parent: null,
      children: [],
      transform: {
        position: { x: worldPos.x, y: worldPos.y },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      content: 'Text',
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [{ ...this.context.defaultFill }],
      strokes: [{ ...this.context.defaultStroke, visible: false }],
    };

    this.context.sceneGraph.addNode(textNode);
    this.context.setSelectedIds([id]);

    // Trigger inline text editing
    this.context.onEnterTextEdit?.(id);
  }

  onPointerMove(_event: CanvasPointerEvent): void {
    // No-op — text tool doesn't have drag behavior
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    // No-op
  }
}
