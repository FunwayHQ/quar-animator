/**
 * Changing a bone's length.
 */

import type { BoneNode, Node } from '@quar/types';

interface GraphLike {
  getNode(id: string): Node | undefined;
  updateNode(id: string, data: Partial<Node>): void;
}

/**
 * Set a bone's length. Bones attached at its tip (their head where the tip
 * was) move with the tip, so the chain stays joined.
 */
export function setBoneLength(sceneGraph: GraphLike, boneId: string, length: number): void {
  const bone = sceneGraph.getNode(boneId);
  if (!bone || bone.type !== 'bone') return;
  const oldLength = bone.length;
  sceneGraph.updateNode(boneId, { length } as Partial<BoneNode>);
  for (const childId of bone.children) {
    const child = sceneGraph.getNode(childId);
    if (!child || child.type !== 'bone') continue;
    const { x, y } = child.transform.position;
    if (Math.abs(x - oldLength) > 0.01 || Math.abs(y) > 0.01) continue;
    sceneGraph.updateNode(childId, {
      transform: { ...child.transform, position: { x: length, y } },
    });
  }
}
