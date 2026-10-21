/**
 * Backdrop for Quar Animator
 * What's behind a point on the canvas — the topmost artboard there, or the
 * document background — and a stroke color that shows up against it, so a
 * new shape's outline isn't black on a dark canvas.
 */

import type { Color, Node, Stroke, Vector2 } from '@quar/types';
import { mat3 } from '@quar/core';

interface GraphLike {
  traverseVisible(callback: (node: Node) => void): void;
  getWorldTransform(id: string): import('@quar/types').Matrix3;
}

/** The color behind `point`: the topmost artboard containing it, else the document background. */
export function backdropColorAt(
  sceneGraph: GraphLike,
  point: Vector2,
  documentBackground: Color
): Color {
  let color = documentBackground;
  sceneGraph.traverseVisible((node) => {
    if (node.type !== 'artboard') return;
    const board = node;
    const inverse = mat3.invert(sceneGraph.getWorldTransform(board.id));
    if (!inverse) return;
    const local = mat3.transformPoint(inverse, point);
    const anchor = board.transform.anchor;
    const left = -board.width * anchor.x;
    const bottom = -board.height * anchor.y;
    const inside =
      local.x >= left &&
      local.x <= left + board.width &&
      local.y >= bottom &&
      local.y <= bottom + board.height;
    const fill = board.fills.find((f) => f.visible && f.type === 'solid' && f.color);
    // Later artboards draw on top
    if (inside && fill?.color) color = fill.color;
  });
  return color;
}

/** Relative luminance (sRGB, 0–1). */
function luminance({ r, g, b }: Color): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const INK: Color = { r: 0, g: 0, b: 0, a: 1 };
const CHALK: Color = { r: 244, g: 244, b: 245, a: 1 };

/** The stroke, black or near-white — whichever stands out against `backdrop`. */
export function strokeAgainst(stroke: Stroke, backdrop: Color): Stroke {
  // Contrast with black vs with near-white (WCAG): pick the higher
  const l = luminance(backdrop);
  const againstInk = (l + 0.05) / 0.05;
  const againstChalk = (luminance(CHALK) + 0.05) / (l + 0.05);
  return { ...stroke, color: { ...(againstInk >= againstChalk ? INK : CHALK) } };
}
