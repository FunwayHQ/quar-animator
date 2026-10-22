/**
 * The selection box of skinned layers follows their bones: their bounds come
 * from the mesh as the bones bend it. Working that out skins the whole mesh
 * on the CPU, so the canvas does it again only when the scene or the
 * selection changed, not on every frame while nothing moves.
 */

import type { Node } from '@quar/types';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DeformedBoundsScene {
  getNode(id: string): Node | undefined;
  getChildren(id: string): Node[];
}

function isSkinned(node: Node): boolean {
  return 'skinData' in node && node.skinData != null;
}

/**
 * The bounds of each selected skinned layer, and of each selected group with
 * skinned layers in it, as their bones bend them. `complete` is false when
 * some mesh had nothing to measure yet (it hasn't been drawn).
 */
export function selectedDeformedBounds(
  selection: ReadonlySet<string>,
  sceneGraph: DeformedBoundsScene,
  deformedBoundsOf: (node: Node) => Bounds | null
): { bounds: Map<string, Bounds>; complete: boolean } {
  const bounds = new Map<string, Bounds>();
  let complete = true;
  for (const id of selection) {
    const node = sceneGraph.getNode(id);
    if (!node) continue;
    if (isSkinned(node)) {
      const nodeBounds = deformedBoundsOf(node);
      if (nodeBounds) bounds.set(id, nodeBounds);
      else complete = false;
    } else if (node.type === 'group') {
      // A group around skinned layers spans them as bent
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let hasSkin = false;
      for (const child of sceneGraph.getChildren(id)) {
        if (!isSkinned(child)) continue;
        const childBounds = deformedBoundsOf(child);
        if (!childBounds) {
          complete = false;
          continue;
        }
        hasSkin = true;
        minX = Math.min(minX, childBounds.x);
        minY = Math.min(minY, childBounds.y);
        maxX = Math.max(maxX, childBounds.x + childBounds.width);
        maxY = Math.max(maxY, childBounds.y + childBounds.height);
      }
      if (hasSkin) bounds.set(id, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
  }
  return { bounds, complete };
}

/**
 * Keeps the last bounds worked out, for as long as the scene (its version,
 * which every change to it moves on) and the selection stay the same. Bounds
 * that weren't all ready are worked out again next time.
 */
export class DeformedBoundsCache {
  private key: { sceneVersion: number; selection: ReadonlySet<string> } | null = null;
  private bounds = new Map<string, Bounds>();

  get(
    sceneVersion: number,
    selection: ReadonlySet<string>,
    compute: () => { bounds: Map<string, Bounds>; complete: boolean }
  ): Map<string, Bounds> {
    if (this.key && this.key.sceneVersion === sceneVersion && this.key.selection === selection) {
      return this.bounds;
    }
    const { bounds, complete } = compute();
    this.bounds = bounds;
    this.key = complete ? { sceneVersion, selection } : null;
    return bounds;
  }
}
