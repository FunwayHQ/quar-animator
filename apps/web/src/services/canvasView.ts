/**
 * Where the canvas is looking, for what's put "in the middle of the canvas"
 * from outside it (a symbol placed from the Symbols panel). The canvas says
 * while it's there.
 */

import type { Vector2 } from '@quar/types';

let viewCenter: (() => Vector2) | null = null;

/** The canvas tells how to find the world point at its middle (null once it's gone). */
export function setCanvasViewCenter(center: (() => Vector2) | null): void {
  viewCenter = center;
}

/** The world point in the middle of the canvas view; null with no canvas. */
export function canvasViewCenter(): Vector2 | null {
  return viewCenter ? viewCenter() : null;
}
