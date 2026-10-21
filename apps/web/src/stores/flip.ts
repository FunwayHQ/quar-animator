/**
 * Flipping layers for Quar Animator
 * Mirrors layers across a vertical (Flip Horizontal) or horizontal (Flip
 * Vertical) line through a point on the canvas, as a negative scale. The
 * flip is worked out in each layer's parent space, and applied to its
 * keyframes too, so it stays flipped as it animates.
 */

import { mat3 } from '@quar/core';
import type { Matrix3, Node, Vector2 } from '@quar/types';
import { mapPlacement, type Placement } from './reparent';

export type FlipAxis = 'horizontal' | 'vertical';

const DEGREES = 180 / Math.PI;

/** The canvas reflection: across x = center.x (horizontal) or y = center.y (vertical). */
export function flipMatrix(axis: FlipAxis, center: Vector2): Matrix3 {
  return axis === 'horizontal'
    ? { a: -1, b: 0, c: 0, d: 1, tx: 2 * center.x, ty: 0 }
    : { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 2 * center.y };
}

/** A canvas-space flip in a parent's space: P⁻¹ · F · P (P the parent's world matrix). */
export function flipInParentSpace(flip: Matrix3, parentWorld: Matrix3 | null): Matrix3 {
  if (!parentWorld) return flip;
  const inverse = mat3.invert(parentWorld);
  return inverse ? mat3.multiply(inverse, mat3.multiply(flip, parentWorld)) : flip;
}

/**
 * A placement flipped by `m` (a reflection, in the layer's parent space).
 * A horizontal flip negates the X scale and a vertical one the Y scale, the
 * rotation running backwards — so a flipped layer reads as you'd expect in
 * the Properties panel (no stray 180° turns), and a flip twice is undone.
 * When the parent is scaled unevenly the reflection isn't a pure one, and
 * the nearest placement without skew is used (as for reparenting).
 */
export function flipPlacement(placement: Placement, m: Matrix3, axis: FlipAxis): Placement {
  const { a, b, c, d } = m;
  const k = Math.hypot(a, b);
  const tolerance = 1e-6 * Math.max(1, k);
  if (Math.abs(a + d) >= tolerance || Math.abs(b - c) >= tolerance) {
    return mapPlacement(placement, m);
  }
  // A reflection (times k) across a line at angle φ: R(2φ)·S(k, -k), so with
  // the layer's own R(θ)·S: R(2φ - θ)·S(k·sx, -k·sy), or the same turned a
  // half turn with the other scale negated
  const position = mat3.transformPoint(m, {
    x: placement['transform.position.x'],
    y: placement['transform.position.y'],
  });
  const twoPhi = Math.atan2(b, a) * DEGREES;
  const turn = axis === 'horizontal' ? twoPhi + 180 : twoPhi;
  // Whole turns off, so a flip in an unrotated parent keeps rotation at -θ
  const offset = turn - 360 * Math.round(turn / 360);
  const scaleX = placement['transform.scale.x'] * k;
  const scaleY = placement['transform.scale.y'] * k;
  return {
    'transform.position.x': position.x,
    'transform.position.y': position.y,
    'transform.rotation': offset - placement['transform.rotation'],
    'transform.scale.x': axis === 'horizontal' ? -scaleX : scaleX,
    'transform.scale.y': axis === 'horizontal' ? scaleY : -scaleY,
  };
}

/**
 * The selected layers a flip moves: the topmost ones (a selected group's
 * selected children go along with it), leaving out locked layers (or ones
 * in a locked group) and bones and IK targets, which the rig places.
 */
export function flippableLayers(
  sceneGraph: { getNode(id: string): Node | undefined },
  selectedIds: Iterable<string>
): string[] {
  const selected = new Set(selectedIds);
  const ancestors = (node: Node): Node[] => {
    const chain: Node[] = [];
    for (let id = node.parent; id; ) {
      const parent = sceneGraph.getNode(id);
      if (!parent) break;
      chain.push(parent);
      id = parent.parent;
    }
    return chain;
  };
  return [...selected].filter((id) => {
    const node = sceneGraph.getNode(id);
    if (!node || node.locked || node.type === 'bone' || node.type === 'ik-target') return false;
    const above = ancestors(node);
    return !above.some((parent) => parent.locked || selected.has(parent.id));
  });
}
