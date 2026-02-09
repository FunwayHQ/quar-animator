/**
 * Hand Tool for Quar Animator
 * Dedicated panning tool — click and drag to pan the camera.
 * Cursor: grab (idle), grabbing (dragging).
 */

import type { ToolType, CanvasPointerEvent } from '@quar/types';
import { BaseTool } from './BaseTool';

export class HandTool extends BaseTool {
  readonly type: ToolType = 'hand';
  readonly cursor = 'grab';

  private currentCursor = 'grab';
  private lastScreenPos: { x: number; y: number } | null = null;

  getCursor(): string {
    return this.currentCursor;
  }

  onPointerDown(event: CanvasPointerEvent): void {
    this.state.isDragging = true;
    this.lastScreenPos = { x: event.screenPosition.x, y: event.screenPosition.y };
    this.currentCursor = 'grabbing';
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.lastScreenPos) return;

    const dx = event.screenPosition.x - this.lastScreenPos.x;
    const dy = event.screenPosition.y - this.lastScreenPos.y;

    this.context.camera.pan({ x: dx, y: dy });
    this.lastScreenPos = { x: event.screenPosition.x, y: event.screenPosition.y };
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    this.state.isDragging = false;
    this.lastScreenPos = null;
    this.currentCursor = 'grab';
  }

  onDeactivate(): void {
    this.state.isDragging = false;
    this.lastScreenPos = null;
    this.currentCursor = 'grab';
  }
}
