/**
 * Text Placement for Quar Animator
 * Keeps text where it is when its content or box changes, as Figma does.
 */

import type { Rect, TextNode, Vector2 } from '@quar/types';
import { mat3 } from '../math';
import { getTextNodeBounds } from './textMetrics';

/**
 * Bounds of a text node's box in its local space, offset for its anchor the
 * way the renderer draws it.
 */
export function getTextLocalBounds(node: TextNode): Rect {
  const raw = getTextNodeBounds(node);
  const { x: ax, y: ay } = node.transform.anchor;
  if (ax === 0 && ay === 0) return raw;
  return { x: -raw.width * ax, y: -raw.height * ay, width: raw.width, height: raw.height };
}

/**
 * The position that keeps `after` — the node with its new text or box — in
 * the place `before` was: the top of the box stays, and so does its left edge,
 * center or right edge, as the text is aligned.
 */
export function keepTextInPlace(before: TextNode, after: TextNode): Vector2 {
  const from = pinPoint(getTextLocalBounds(before), after.textAlign);
  const to = pinPoint(getTextLocalBounds(after), after.textAlign);
  const { rotation, scale } = after.transform;
  const shift = mat3.transformPoint(mat3.compose({ x: 0, y: 0 }, rotation, scale), {
    x: from.x - to.x,
    y: from.y - to.y,
  });
  return {
    x: before.transform.position.x + shift.x,
    y: before.transform.position.y + shift.y,
  };
}

/** The point of a box that stays put: the top, at the aligned edge (Y-up). */
function pinPoint(bounds: Rect, align: TextNode['textAlign']): Vector2 {
  const x =
    align === 'center'
      ? bounds.x + bounds.width / 2
      : align === 'right'
        ? bounds.x + bounds.width
        : bounds.x;
  return { x, y: bounds.y + bounds.height };
}
